const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

app.use(cors());
app.use(express.json());

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '..', 'client')));

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

// Check if server has API keys configured
app.get('/api/config', (req, res) => {
    res.json({
        hasOmdbKey: !!OMDB_API_KEY,
        hasTmdbKey: !!TMDB_API_KEY
    });
});

// Serve the app for any other route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Start server
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
