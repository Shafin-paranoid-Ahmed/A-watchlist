/**
 * Optional cloud sync via Supabase (REST + service role key on server only).
 * Each "profile slug" = one person's list. Share ?p=slug with your partner.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
// Dashboard may label this "Secret key" (sb_secret_...) or legacy "service_role" JWT
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function isConfigured() {
    return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function headers() {
    return {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    };
}

function normalizeSlug(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const x = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    if (x.length < 1 || x.length > 48) return null;
    return x;
}

async function getWatchlistData(slug) {
    const url =
        `${SUPABASE_URL}/rest/v1/watchlists?profile_slug=eq.${encodeURIComponent(slug)}&select=data`;
    const res = await fetch(url, { headers: { ...headers(), Prefer: 'return=representation' } });
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) return null;
    return rows[0].data;
}

async function upsertWatchlistData(slug, data) {
    const url = `${SUPABASE_URL}/rest/v1/watchlists`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            ...headers(),
            Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            profile_slug: slug,
            data,
            updated_at: new Date().toISOString()
        })
    });
    if (!res.ok) throw new Error(`Supabase write failed: ${res.status} ${await res.text()}`);
}

module.exports = {
    isConfigured,
    normalizeSlug,
    getWatchlistData,
    upsertWatchlistData
};
