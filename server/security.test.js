// Security regression checks. Run: npm test
// Env is set before requiring the app so dotenv never loads real keys from .env files
// (dotenv does not override variables that already exist, even empty ones).
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

Object.assign(process.env, {
    PRIVATE_SITE_PASSWORD: 'correct-horse',
    SITE_AUTH_SECRET: 'test-signing-secret',
    TMDB_API_KEY: 'test-tmdb-key',
    OMDB_API_KEY: '',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_SECRET_KEY: '',
    VERCEL: '',
    NODE_ENV: 'test'
});

// Record upstream calls; never hit the network.
const upstream = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
    upstream.push(u);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const app = require('./index');
const privateSite = require('./private-site');

function listen(a) {
    return new Promise((resolve) => {
        const srv = a.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

let server;
let base;
test.before(async () => {
    server = await listen(app);
    base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
    server.closeAllConnections();
    server.close();
});

async function login(password = 'correct-horse') {
    const r = await fetch(`${base}/api/site-auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const setCookie = r.headers.get('set-cookie') || '';
    return { status: r.status, cookie: setCookie.split(';')[0] };
}

test('gate: unauthenticated API and sync requests are rejected', async () => {
    for (const [method, path] of [
        ['GET', '/api/sync/you'],
        ['PUT', '/api/sync/you'],
        ['GET', '/api/tmdb/movie/550'],
        ['POST', '/api/enrich-batch']
    ]) {
        const r = await fetch(base + path, { method });
        assert.equal(r.status, 401, `${method} ${path}`);
    }
});

test('gate: public auth/config routes stay reachable', async () => {
    assert.equal((await fetch(`${base}/api/config`)).status, 200);
    assert.equal((await fetch(`${base}/api/site-auth/status`)).status, 200);
});

test('gate: wrong password is rejected, right password grants access', async () => {
    assert.equal((await login('nope')).status, 401);
    const { status, cookie } = await login();
    assert.equal(status, 200);
    const r = await fetch(`${base}/api/tmdb/movie/550`, { headers: { cookie } });
    assert.equal(r.status, 200);
});

test('gate: forged or malformed cookies are treated as no session (no 500)', async () => {
    for (const value of ['%E0%A4%A', 'abc.def', 'e30.%%%', '']) {
        const r = await fetch(`${base}/api/tmdb/movie/550`, {
            headers: { cookie: `${privateSite.COOKIE_NAME}=${value}` }
        });
        assert.equal(r.status, 401, `cookie value ${JSON.stringify(value)}`);
    }
});

test('rotation: changing the password invalidates sessions even with SITE_AUTH_SECRET set', async () => {
    const { cookie } = await login();
    const rotated = express();
    rotated.use(privateSite.createPrivateSiteGateMiddleware({ password: 'new-password' }));
    rotated.get('/api/x', (req, res) => res.json({ ok: true }));
    const srv = await listen(rotated);
    try {
        const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/x`, { headers: { cookie } });
        assert.equal(r.status, 401);
    } finally {
        srv.closeAllConnections();
        srv.close();
    }
});

test('tmdb proxy: path/query injection does not reach other upstream endpoints', async () => {
    const { cookie } = await login();
    const bad = [
        '/api/tmdb/..%2F..%2F4%2Flist/1',
        '/api/tmdb/account/1',
        '/api/tmdb/movie/550%3Fapi_key%3Dx',
        '/api/tmdb/person/1%2F..%2F..%2Fconfiguration/combined_credits'
    ];
    for (const p of bad) {
        upstream.length = 0;
        const r = await fetch(base + p, { headers: { cookie } });
        assert.equal(r.status, 400, p);
        assert.equal(upstream.length, 0, `${p} reached upstream: ${upstream[0]}`);
    }

    upstream.length = 0;
    await fetch(`${base}/api/tmdb/search?query=x&year=${encodeURIComponent('2020&include_adult=true')}`, {
        headers: { cookie }
    });
    assert.ok(!upstream[0].includes('&include_adult=true'), upstream[0]);

    upstream.length = 0;
    assert.equal((await fetch(`${base}/api/tmdb/tv/1399`, { headers: { cookie } })).status, 200);
    assert.match(upstream[0], /^https:\/\/api\.themoviedb\.org\/3\/tv\/1399\?/);
});
