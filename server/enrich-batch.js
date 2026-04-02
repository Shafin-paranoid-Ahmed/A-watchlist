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

async function enrichFromTmdb(item, apiKey) {
    const patch = {};
    if (!apiKey || item.posterUrl) return patch;

    let url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(item.title)}`;
    if (item.year) url += `&year=${item.year}`;
    const data = await fetchJson(url);
    const results = (data.results || []).filter(
        (r) => r.media_type === 'movie' || r.media_type === 'tv'
    );
    const match = results[0];
    if (!match) return patch;

    if (match.poster_path) patch.posterUrl = tmdbPoster(match.poster_path);

    const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
    const dUrl = `https://api.themoviedb.org/3/${mediaType}/${match.id}?api_key=${apiKey}&append_to_response=external_ids,credits`;
    const details = await fetchJson(dUrl);

    if (details.genres?.length && !item.genre) {
        patch.genre = details.genres.map((g) => g.name).join(', ');
    }
    if (details.external_ids?.imdb_id) {
        patch.imdbLink = `https://www.imdb.com/title/${details.external_ids.imdb_id}/`;
    }
    return patch;
}

async function enrichFromOmdb(item, apiKey) {
    const patch = {};
    if (!apiKey || (item.imdbRating != null && item.imdbRating !== '')) return patch;

    let url = `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(item.title)}`;
    if (item.year) url += `&y=${item.year}`;
    const o = await fetchJson(url);
    if (o.Response !== 'True') return patch;

    if (o.imdbRating && o.imdbRating !== 'N/A') {
        patch.imdbRating = parseFloat(o.imdbRating);
    }
    if (!item.imdbLink && o.imdbID) {
        patch.imdbLink = `https://www.imdb.com/title/${o.imdbID}/`;
    }
    if (!item.genre && o.Genre) patch.genre = o.Genre;
    if (o.Ratings) {
        const rt = o.Ratings.find((r) => r.Source === 'Rotten Tomatoes');
        if (rt && (item.rtRating == null || item.rtRating === '')) {
            const n = parseInt(String(rt.Value).replace(/%/g, ''), 10);
            if (!Number.isNaN(n)) patch.rtRating = n;
        }
    }
    if (!item.posterUrl && o.Poster && o.Poster !== 'N/A') {
        patch.posterUrl = o.Poster;
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
    if (omdbPatch.imdbRating !== undefined) out.imdbRating = omdbPatch.imdbRating;
    if (omdbPatch.rtRating !== undefined) out.rtRating = omdbPatch.rtRating;
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
    return false;
}

async function enrichOneItem(item, tmdbKey, omdbKey) {
    const safe = {
        id: item.id,
        title: String(item.title || '').trim(),
        year: item.year != null ? item.year : null,
        posterUrl: item.posterUrl || '',
        imdbRating: item.imdbRating,
        genre: item.genre || '',
        imdbLink: item.imdbLink || '',
        rtRating: item.rtRating
    };
    if (!safe.title) {
        return { id: item.id, patch: { id: item.id }, found: false };
    }

    const [tmdbPatch, omdbPatch] = await Promise.all([
        enrichFromTmdb(safe, tmdbKey),
        enrichFromOmdb(safe, omdbKey)
    ]);

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
