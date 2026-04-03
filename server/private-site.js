/**
 * Optional private site mode: set PRIVATE_SITE_PASSWORD in env.
 * Unauthenticated visitors get /gate.html; /api/* (except site-auth + config) returns 401;
 * static assets (.js, .css, images) return 403 without a valid session cookie.
 */
const crypto = require('crypto');

const COOKIE_NAME = 'watchlist_site';
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSigningSecret(password) {
    const explicit = process.env.SITE_AUTH_SECRET;
    if (explicit && String(explicit).trim()) {
        return String(explicit).trim();
    }
    return crypto.createHash('sha256').update(`watchlist-site-v1|${password}`).digest('hex');
}

function signToken(secret) {
    const exp = Date.now() + TOKEN_MAX_AGE_MS;
    const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

function verifyToken(secret, raw) {
    if (!raw || typeof raw !== 'string') return false;
    const i = raw.lastIndexOf('.');
    if (i <= 0) return false;
    const payload = raw.slice(0, i);
    const sig = raw.slice(i + 1);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return typeof data.exp === 'number' && data.exp > Date.now();
    } catch {
        return false;
    }
}

function getCookie(req, name) {
    const raw = req.headers.cookie;
    if (!raw || typeof raw !== 'string') return null;
    const parts = raw.split(';');
    for (const p of parts) {
        const idx = p.indexOf('=');
        if (idx === -1) continue;
        const k = p.slice(0, idx).trim();
        if (k === name) {
            return decodeURIComponent(p.slice(idx + 1).trim());
        }
    }
    return null;
}

function hasValidSession(req, password, secret) {
    const token = getCookie(req, COOKIE_NAME);
    return verifyToken(secret, token);
}

function timingSafePasswordOk(input, expected) {
    const a = Buffer.from(String(input ?? ''), 'utf8');
    const b = Buffer.from(String(expected ?? ''), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * @param {import('express').Application} app
 * @param {{ password: string }} opts
 */
function registerSiteAuthRoutes(app, opts) {
    const { password } = opts;
    const secret = getSigningSecret(password);

    app.get('/api/site-auth/status', (req, res) => {
        const enabled = !!password;
        res.json({
            privateSite: enabled,
            ok: !enabled || hasValidSession(req, password, secret)
        });
    });

    app.post('/api/site-auth/login', (req, res) => {
        if (!password) {
            return res.json({ ok: true, skipped: true });
        }
        const bodyPassword = req.body?.password;
        if (typeof bodyPassword !== 'string' || !timingSafePasswordOk(bodyPassword, password)) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        const token = signToken(secret);
        const isProd = !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            maxAge: TOKEN_MAX_AGE_MS,
            path: '/'
        });
        res.json({ ok: true });
    });

    app.post('/api/site-auth/logout', (req, res) => {
        res.clearCookie(COOKIE_NAME, { path: '/' });
        res.json({ ok: true });
    });
}

/**
 * @param {{ password: string }} opts
 */
function createPrivateSiteGateMiddleware(opts) {
    const { password } = opts;
    if (!password) {
        return (req, res, next) => next();
    }
    const secret = getSigningSecret(password);

    const publicApiPrefixes = ['/api/site-auth'];
    const publicApiExact = ['/api/config'];

    const isPublicApi = (p) => {
        if (publicApiExact.includes(p)) return true;
        return publicApiPrefixes.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
    };

    const isAssetPath = (p) => /\.[a-zA-Z0-9]{1,8}$/.test(p);

    return (req, res, next) => {
        if (req.method === 'OPTIONS') {
            return next();
        }
        if (hasValidSession(req, password, secret)) {
            return next();
        }

        const p = req.path || '/';

        if (p === '/gate.html') {
            return next();
        }

        if (p.startsWith('/api/')) {
            if (isPublicApi(p)) {
                return next();
            }
            return res.status(401).json({ error: 'Unauthorized', needLogin: true });
        }

        if (isAssetPath(p)) {
            return res.status(403).type('text/plain').send('Forbidden');
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            return res.redirect(302, '/gate.html');
        }

        return res.status(403).type('text/plain').send('Forbidden');
    };
}

module.exports = {
    COOKIE_NAME,
    registerSiteAuthRoutes,
    createPrivateSiteGateMiddleware,
    hasValidSession,
    getSigningSecret
};
