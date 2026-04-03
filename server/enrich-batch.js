/**
 * Batch-enrich watchlist rows (posters, ratings, links) using TMDB + OMDB.
 * Used by POST /api/enrich-batch with bounded concurrency for speed.
 */

const TMDB_IMG = 'https://image.tmdb.org/t/p/';

function tmdbPoster(posterPath) {
    if (!posterPath) return '';
    return `${TMDB_IMG}w500${posterPath}`;
}

async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

function extractImdbId(link) {
    const m = String(link || '').match(/tt\d+/i);
    return m ? m[0] : null;
}

async function enrichFromTmdb(item, apiKey) {
    const patch = {};
    if (!apiKey) return patch;

    try {
        let url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(item.title)}`;
        if (item.year) url += `&year=${item.year}`;
        const data = await fetchJson(url);
        const results = (data.results || []).filter(
            (r) => r.media_type === 'movie' || r.media_type === 'tv'
        );
        const match = results[0];
        if (!match) return patch;

        patch.type = match.media_type === 'tv' ? 'series' : 'movie';
        if (match.media_type === 'tv') {
            patch.tmdbTvId = match.id;
        }

        const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
        const dUrl = `https://api.themoviedb.org/3/${mediaType}/${match.id}?api_key=${apiKey}&append_to_response=external_ids,credits`;
        const details = await fetchJson(dUrl);

        if (!item.posterUrl && details.poster_path) {
            patch.posterUrl = tmdbPoster(details.poster_path);
        }
        if (!item.genre && details.genres?.length) {
            patch.genre = details.genres.map((g) => g.name).join(', ');
        }
        if (!item.imdbLink && details.external_ids?.imdb_id) {
            patch.imdbLink = `https://www.imdb.com/title/${details.external_ids.imdb_id}/`;
        }
        const overview = String(details.overview || '').trim();
        if (overview && !String(item.notes || '').trim()) {
            patch.notes = overview;
        }
    } catch (e) {
        console.warn('enrichFromTmdb', item?.title, e.message || e);
    }

    return patch;
}

async function enrichFromOmdb(item, apiKey) {
    const patch = {};
    if (!apiKey) return patch;

    const needRating = item.imdbRating == null || item.imdbRating === '';
    const needRt = item.rtRating == null || item.rtRating === '';
    const needNotes = !String(item.notes || '').trim();
    if (!needRating && !needRt && !needNotes) return patch;

    let url;
    const imdbId = extractImdbId(item.imdbLink);
    if (imdbId) {
        url = `https://www.omdbapi.com/?apikey=${apiKey}&i=${encodeURIComponent(imdbId)}&plot=full`;
    } else {
        url = `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(item.title)}`;
        if (item.year) url += `&y=${item.year}`;
        url += '&plot=full';
    }

    let o;
    try {
        const r = await fetch(url);
        o = await r.json();
    } catch (e) {
        console.warn('enrichFromOmdb fetch', item?.title, e.message || e);
        return patch;
    }
    if (!o || o.Response !== 'True') return patch;

    const oType = (o.Type || '').toLowerCase();
    if (oType === 'series' || oType === 'episode') patch.type = 'series';
    else if (oType === 'movie') patch.type = 'movie';

    if (needRating && o.imdbRating && o.imdbRating !== 'N/A') {
        patch.imdbRating = parseFloat(o.imdbRating);
    }
    if (!item.imdbLink && o.imdbID) {
        patch.imdbLink = `https://www.imdb.com/title/${o.imdbID}/`;
    }
    if (!item.genre && o.Genre) patch.genre = o.Genre;
    if (o.Ratings && needRt) {
        const rt = o.Ratings.find((r) => r.Source === 'Rotten Tomatoes');
        if (rt) {
            const n = parseInt(String(rt.Value).replace(/%/g, ''), 10);
            if (!Number.isNaN(n)) patch.rtRating = n;
        }
    }
    if (!item.posterUrl && o.Poster && o.Poster !== 'N/A') {
        patch.posterUrl = o.Poster;
    }
    if (needNotes && o.Plot && o.Plot !== 'N/A') {
        patch.notes = o.Plot;
    }
    return patch;
}

function combinePatches(item, tmdbPatch, omdbPatch) {
    const out = { id: item.id };
    if (tmdbPatch.posterUrl) out.posterUrl = tmdbPatch.posterUrl;
    else if (omdbPatch.posterUrl) out.posterUrl = omdbPatch.posterUrl;
    if (tmdbPatch.genre) out.genre = tmdbPatch.genre;
    else if (omdbPatch.genre) out.genre = omdbPatch.genre;
    if (tmdbPatch.imdbLink) out.imdbLink = tmdbPatch.imdbLink;
    else if (omdbPatch.imdbLink) out.imdbLink = omdbPatch.imdbLink;
    if (tmdbPatch.type) out.type = tmdbPatch.type;
    else if (omdbPatch.type) out.type = omdbPatch.type;
    if (tmdbPatch.tmdbTvId != null) out.tmdbTvId = tmdbPatch.tmdbTvId;
    if (omdbPatch.imdbRating !== undefined) out.imdbRating = omdbPatch.imdbRating;
    if (omdbPatch.rtRating !== undefined) out.rtRating = omdbPatch.rtRating;
    if (omdbPatch.notes) out.notes = omdbPatch.notes;
    else if (tmdbPatch.notes) out.notes = tmdbPatch.notes;
    return out;
}

function foundNewData(original, merged) {
    if (merged.posterUrl && String(merged.posterUrl).trim() !== String(original.posterUrl || '').trim()) {
        return true;
    }
    if (
        merged.imdbRating != null &&
        merged.imdbRating !== '' &&
        (original.imdbRating == null || original.imdbRating === '')
    ) {
        return true;
    }
    if (merged.imdbLink && merged.imdbLink !== (original.imdbLink || '')) return true;
    if (merged.genre && merged.genre !== (original.genre || '')) return true;
    if (merged.rtRating != null && merged.rtRating !== '' && (original.rtRating == null || original.rtRating === '')) {
        return true;
    }
    if (
        merged.notes &&
        String(merged.notes).trim() &&
        String(merged.notes).trim() !== String(original.notes || '').trim()
    ) {
        return true;
    }
    if (merged.type && (merged.type === 'movie' || merged.type === 'series')) {
        const orig = original.type || 'movie';
        if (merged.type !== orig) return true;
    }
    if (merged.tmdbTvId != null) {
        const om = Number(original.tmdbTvId);
        const mm = Number(merged.tmdbTvId);
        if (!Number.isFinite(om) || om !== mm) return true;
    }
    return false;
}

async function enrichOneItem(item, tmdbKey, omdbKey) {
    const safe = {
        id: item.id,
        title: String(item.title || '').trim(),
        year: item.year != null ? item.year : null,
        type: item.type || 'movie',
        posterUrl: item.posterUrl || '',
        imdbRating: item.imdbRating,
        genre: item.genre || '',
        imdbLink: item.imdbLink || '',
        rtRating: item.rtRating,
        notes: item.notes != null ? String(item.notes) : '',
        tmdbTvId: item.tmdbTvId != null ? item.tmdbTvId : null
    };
    if (!safe.title) {
        return { id: item.id, patch: { id: item.id }, found: false };
    }

    const tmdbPatch = await enrichFromTmdb(safe, tmdbKey);
    const afterTmdb = { ...safe, ...tmdbPatch };
    const omdbPatch = await enrichFromOmdb(afterTmdb, omdbKey);

    const combined = combinePatches(safe, tmdbPatch, omdbPatch);
    const found = foundNewData(safe, combined);
    return { id: safe.id, patch: combined, found };
}

/**
 * @param {object[]} items
 * @param {{ tmdbKey: string, omdbKey: string, concurrency?: number }} opts
 * @returns {Promise<{ results: object[], updated: number, failed: number }>}
 */
async function enrichBatch(items, opts) {
    const { tmdbKey, omdbKey, concurrency = 6 } = opts;
    const results = new Array(items.length);
    let next = 0;

    async function worker() {
        for (;;) {
            const i = next++;
            if (i >= items.length) break;
            try {
                results[i] = await enrichOneItem(items[i], tmdbKey, omdbKey);
            } catch (e) {
                console.error('enrich item', items[i]?.id, e);
                results[i] = { id: items[i]?.id, patch: { id: items[i]?.id }, found: false };
            }
        }
    }

    const n = Math.min(concurrency, Math.max(1, items.length));
    await Promise.all(Array.from({ length: n }, () => worker()));

    let updated = 0;
    let failed = 0;
    const out = [];
    for (const r of results) {
        if (r.found) {
            updated++;
            out.push(r.patch);
        } else {
            failed++;
        }
    }
    return { results: out, updated, failed };
}

module.exports = { enrichBatch };
