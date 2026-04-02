const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from .env file (root or server folder)
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
// One shared playlist for "watch together" (same DB row for everyone)
const SHARED_LIST_SLUG = (process.env.SHARED_LIST_SLUG || 'watch-together').trim().toLowerCase();

const supabaseSync = require('./supabase-sync');
const { enrichBatch } = require('./enrich-batch');

const ENRICH_BATCH_MAX = 120;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Local: serve client/ with Express.
// Vercel: ignores express.static — static files must live in public/ (copied by vercel-build).
if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '..', 'client')));
}

// ============================================
// API PROXY ENDPOINTS
// These hide your API keys from the client
// ============================================

// OMDB proxy
app.get('/api/omdb', async (req, res) => {
    if (!OMDB_API_KEY) {
        return res.status(400).json({ error: 'OMDB API key not configured' });
    }
    
    const { s, i, t, y } = req.query;
    let url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}`;
    
    if (s) url += `&s=${encodeURIComponent(s)}`;
    if (i) url += `&i=${encodeURIComponent(i)}`;
    if (t) url += `&t=${encodeURIComponent(t)}`;
    if (y) url += `&y=${encodeURIComponent(y)}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('OMDB error:', error);
        res.status(500).json({ error: 'Failed to fetch from OMDB' });
    }
});

// TMDB search proxy
app.get('/api/tmdb/search', async (req, res) => {
    if (!TMDB_API_KEY) {
        return res.status(400).json({ error: 'TMDB API key not configured' });
    }
    
    const { query, year } = req.query;
    let url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    if (year) url += `&year=${year}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('TMDB search error:', error);
        res.status(500).json({ error: 'Failed to fetch from TMDB' });
    }
});

// TMDB details proxy
app.get('/api/tmdb/:mediaType/:id', async (req, res) => {
    if (!TMDB_API_KEY) {
        return res.status(400).json({ error: 'TMDB API key not configured' });
    }
    
    const { mediaType, id } = req.params;
    const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,credits`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('TMDB details error:', error);
        res.status(500).json({ error: 'Failed to fetch from TMDB' });
    }
});

// Batch enrich (posters + ratings) — parallel upstream calls, used after CSV import / bulk fetch
app.post('/api/enrich-batch', async (req, res) => {
    if (!OMDB_API_KEY && !TMDB_API_KEY) {
        return res.status(503).json({ error: 'TMDB/OMDB not configured on server' });
    }
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Body must be { items: [...] }' });
    }
    if (items.length > ENRICH_BATCH_MAX) {
        return res.status(400).json({ error: `At most ${ENRICH_BATCH_MAX} items per request` });
    }
    const sanitized = items.map((row) => ({
        id: row.id,
        title: row.title,
        year: row.year != null ? row.year : null,
        posterUrl: row.posterUrl || '',
        imdbRating: row.imdbRating,
        genre: row.genre || '',
        imdbLink: row.imdbLink || '',
        rtRating: row.rtRating
    }));
    try {
        const { results, updated, failed } = await enrichBatch(sanitized, {
            tmdbKey: TMDB_API_KEY,
            omdbKey: OMDB_API_KEY,
            concurrency: 6
        });
        res.json({ patches: results, updated, failed });
    } catch (e) {
        console.error('enrich-batch:', e);
        res.status(500).json({ error: 'Batch enrich failed' });
    }
});

// Check if server has API keys configured
app.get('/api/config', (req, res) => {
    res.json({
        hasOmdbKey: !!OMDB_API_KEY,
        hasTmdbKey: !!TMDB_API_KEY,
        hasCloudSync: supabaseSync.isConfigured(),
        sharedListSlug: SHARED_LIST_SLUG
    });
});

// ============================================
// CLOUD SYNC (per-person lists via ?p=slug)
// ============================================

app.get('/api/sync/:slug', async (req, res) => {
    if (!supabaseSync.isConfigured()) {
        return res.status(503).json({ error: 'Cloud sync not configured', enabled: false });
    }
    const slug = supabaseSync.normalizeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Invalid profile id' });
    try {
        const data = await supabaseSync.getWatchlistData(slug);
        const items = Array.isArray(data) ? data : [];
        res.json({ items, slug });
    } catch (e) {
        console.error('sync read:', e);
        res.status(500).json({ error: 'Failed to load list' });
    }
});

app.put('/api/sync/:slug', async (req, res) => {
    if (!supabaseSync.isConfigured()) {
        return res.status(503).json({ error: 'Cloud sync not configured', enabled: false });
    }
    const slug = supabaseSync.normalizeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Invalid profile id' });
    const items = req.body?.items;
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Body must be { items: [...] }' });
    }
    try {
        await supabaseSync.upsertWatchlistData(slug, items);
        res.json({ ok: true, slug });
    } catch (e) {
        console.error('sync write:', e);
        res.status(500).json({ error: 'Failed to save list' });
    }
});

const clientDir = path.join(__dirname, '..', 'client');

// SPA fallback (local only). On Vercel, `public/index.html` is served from the CDN.
if (!process.env.VERCEL) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(clientDir, 'index.html'));
    });
}

// Start server locally (not when loaded by Vercel via root index.js)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('🎬 ═══════════════════════════════════════');
        console.log('   WATCHLIST SERVER');
        console.log('═══════════════════════════════════════════');
        console.log(`   🌐 Running on: http://localhost:${PORT}`);
        console.log(`   📁 Serving:    ./client`);
        console.log('───────────────────────────────────────────');
        console.log(`   🎬 OMDB API:   ${OMDB_API_KEY ? '✓ configured' : '✗ not set'}`);
        console.log(`   🎞️  TMDB API:   ${TMDB_API_KEY ? '✓ configured' : '✗ not set'}`);
        console.log('═══════════════════════════════════════════');
        console.log('');
    });
}

module.exports = app;
