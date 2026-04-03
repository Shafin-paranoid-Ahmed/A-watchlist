# Director Search Feature Guide

This file explains the **Director Search in Add New Modal** feature end-to-end, with the actual code sections you need to understand and modify it safely.

Use this when you want to:
- debug director search
- change UI behavior
- tune results (count, sorting, filtering)
- add more metadata

---

## 1) Feature flow (high level)

1. User types a director name in the **Director** field.
2. User clicks the director search button (or presses Enter in that field).
3. App calls TMDB **person search**.
4. App renders matching directors.
5. User clicks one director.
6. App calls TMDB **combined credits** for that person.
7. App filters credits to `job === "Director"` and renders directed titles.
8. User clicks a title.
9. Existing `selectSearchResult(...)` flow auto-fills title details.

---

## 2) Server routes (TMDB proxies)

**File:** `server/index.js`

These routes keep API keys server-side and let the client call your own backend.

```js
// TMDB person search proxy
app.get('/api/tmdb/search/person', async (req, res) => {
    if (!TMDB_API_KEY) {
        return res.status(400).json({ error: 'TMDB API key not configured' });
    }
    const q = req.query.query;
    if (!q || typeof q !== 'string' || !q.trim()) {
        return res.status(400).json({ error: 'Missing query' });
    }
    const url = `https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q.trim())}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('TMDB person search error:', error);
        res.status(500).json({ error: 'Failed to fetch from TMDB' });
    }
});

// TMDB person combined credits proxy
app.get('/api/tmdb/person/:id/combined_credits', async (req, res) => {
    if (!TMDB_API_KEY) {
        return res.status(400).json({ error: 'TMDB API key not configured' });
    }
    const { id } = req.params;
    const url = `https://api.themoviedb.org/3/person/${id}/combined_credits?api_key=${TMDB_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('TMDB person credits error:', error);
        res.status(500).json({ error: 'Failed to fetch from TMDB' });
    }
});
```

### Why these routes matter
- If you deploy with `TMDB_API_KEY` on the server, client does not expose it.
- Client can still fallback to direct TMDB calls when using local `tmdbApiKey`.

---

## 3) Modal HTML structure

**File:** `client/index.html`

There are now two separate search areas:
- Title search (`#title`, `#searchTitleBtn`, `#searchResults`)
- Director search (`#director`, `#searchDirectorBtn`, `#directorSearchResults`)

```html
<div class="form-group title-search-group">
    <label for="title">Title *</label>
    <div class="title-input-wrapper">
        <input type="text" id="title" required placeholder="e.g., Inception">
        <button type="button" class="search-title-btn" id="searchTitleBtn" title="Auto-fetch details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
            <span>Fetch</span>
        </button>
    </div>
    <div class="search-results" id="searchResults"></div>
</div>
```

```html
<div class="form-group director-search-group">
    <label for="director">Director</label>
    <div class="title-input-wrapper">
        <input type="text" id="director" placeholder="e.g., Christopher Nolan" autocomplete="off">
        <button type="button" class="search-title-btn search-director-btn" id="searchDirectorBtn" title="Search by director — browse their filmography">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
        </button>
    </div>
    <div class="search-results" id="directorSearchResults"></div>
</div>
```

---

## 4) DOM hooks and event wiring

**File:** `client/app.js`

### DOM references
```js
// Search Elements
const searchTitleBtn = document.getElementById('searchTitleBtn');
const searchResults = document.getElementById('searchResults');
const searchDirectorBtn = document.getElementById('searchDirectorBtn');
const directorSearchResults = document.getElementById('directorSearchResults');
```

### Event listeners
```js
// Title search
searchTitleBtn.addEventListener('click', searchForTitle);
document.getElementById('title').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchForTitle();
    }
});

// Director search
if (searchDirectorBtn) {
    searchDirectorBtn.addEventListener('click', searchForDirector);
    document.getElementById('director')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchForDirector();
        }
    });
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.title-search-group')) {
        searchResults.classList.remove('active');
    }
    if (!e.target.closest('.director-search-group')) {
        if (directorSearchResults) directorSearchResults.classList.remove('active');
    }
});
```

---

## 5) Director search logic (core code)

**File:** `client/app.js`

### A) Search directors by name
```js
async function searchForDirector() {
    const directorInput = document.getElementById('director');
    const query = (directorInput?.value || '').trim();

    if (!query) {
        showToast('Please enter a director name to search', 'error');
        return;
    }

    const hasTmdb = serverHasTmdbKey || tmdbApiKey;
    if (!hasTmdb) {
        showToast('Director search requires a TMDB API key (server or Settings)', 'error');
        return;
    }

    if (searchDirectorBtn) {
        searchDirectorBtn.classList.add('loading');
        searchDirectorBtn.disabled = true;
    }

    let people = [];
    try {
        let data;
        if (serverHasTmdbKey) {
            const res = await fetch(`/api/tmdb/search/person?query=${encodeURIComponent(query)}`);
            data = await res.json();
        } else {
            const res = await fetch(`${TMDB_BASE_URL}/search/person?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}`);
            data = await res.json();
        }
        if (data.results && data.results.length > 0) {
            people = data.results
                .filter(p => p.known_for_department === 'Directing')
                .slice(0, 8);
        }
    } catch (error) {
        console.error('Director search error:', error);
    }

    if (searchDirectorBtn) {
        searchDirectorBtn.classList.remove('loading');
        searchDirectorBtn.disabled = false;
    }

    if (people.length === 0) {
        directorSearchResults.innerHTML = '<div class="no-results">No directors found. Try a different name.</div>';
        directorSearchResults.classList.add('active');
        return;
    }

    renderDirectorResults(people);
}
```

### B) Render matched directors
```js
function renderDirectorResults(people) {
    directorSearchResults.innerHTML = people.map(person => {
        const photo = person.profile_path
            ? `<img src="${TMDB_IMAGE_BASE}w185${person.profile_path}" alt="${escapeHtml(person.name)}">`
            : `<span class="search-result-poster-placeholder">🎬</span>`;
        const knownFor = (person.known_for || [])
            .slice(0, 3)
            .map(k => k.title || k.name)
            .filter(Boolean)
            .join(', ');
        return `
            <div class="search-result-item director-result-item" data-person-id="${person.id}">
                <div class="search-result-poster">${photo}</div>
                <div class="search-result-info">
                    <div class="search-result-title">${escapeHtml(person.name)}</div>
                    <div class="search-result-meta">
                        <span>Director</span>
                        ${knownFor ? `<span class="director-known-for" title="${escapeHtml(knownFor)}">Known for: ${escapeHtml(knownFor)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    directorSearchResults.classList.add('active');

    directorSearchResults.querySelectorAll('.director-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const personId = item.dataset.personId;
            const name = item.querySelector('.search-result-title')?.textContent || '';
            showDirectorFilmography(personId, name);
        });
    });
}
```

### C) Load selected director filmography
```js
async function showDirectorFilmography(personId, directorName) {
    directorSearchResults.classList.remove('active');

    if (searchDirectorBtn) {
        searchDirectorBtn.classList.add('loading');
        searchDirectorBtn.disabled = true;
    }

    let results = [];
    try {
        let data;
        if (serverHasTmdbKey) {
            const res = await fetch(`/api/tmdb/person/${personId}/combined_credits`);
            data = await res.json();
        } else {
            const res = await fetch(`${TMDB_BASE_URL}/person/${personId}/combined_credits?api_key=${tmdbApiKey}`);
            data = await res.json();
        }
        if (data.crew && data.crew.length > 0) {
            const directed = data.crew
                .filter(c => c.job === 'Director')
                .sort((a, b) => {
                    const da = a.release_date || a.first_air_date || '';
                    const db = b.release_date || b.first_air_date || '';
                    return db.localeCompare(da);
                });
            const seen = new Set();
            results = directed
                .filter(c => {
                    if (seen.has(c.id)) return false;
                    seen.add(c.id);
                    return true;
                })
                .slice(0, 20)
                .map(c => ({
                    id: c.id,
                    title: c.title || c.name,
                    year: (c.release_date || c.first_air_date || '').split('-')[0],
                    type: c.media_type === 'tv' ? 'series' : 'movie',
                    mediaType: c.media_type,
                    poster: c.poster_path ? getTMDBPosterUrl(c.poster_path, 'w185') : '',
                    rating: c.vote_average ? c.vote_average.toFixed(1) : null,
                    source: 'tmdb'
                }));
        }
    } catch (error) {
        console.error('Director filmography error:', error);
    }

    if (searchDirectorBtn) {
        searchDirectorBtn.classList.remove('loading');
        searchDirectorBtn.disabled = false;
    }

    if (results.length === 0) {
        directorSearchResults.innerHTML = `<div class="no-results">No directed titles found for ${escapeHtml(directorName)}.</div>`;
        directorSearchResults.classList.add('active');
        return;
    }

    directorSearchResults.innerHTML = `<div class="director-filmography-header">Directed by ${escapeHtml(directorName)}</div>`;
    const itemsHtml = results.map(result => {
        return `
            <div class="search-result-item" data-id="${result.id}" data-source="${result.source}" data-media-type="${result.mediaType || result.type}">
                <div class="search-result-poster">
                    ${result.poster
                        ? `<img src="${result.poster}" alt="${escapeHtml(result.title)}">`
                        : `<span class="search-result-poster-placeholder">🎬</span>`
                    }
                </div>
                <div class="search-result-info">
                    <div class="search-result-title">${escapeHtml(result.title)}</div>
                    <div class="search-result-meta">
                        <span>${result.year || 'N/A'}</span>
                        <span>${result.type}</span>
                        ${result.rating ? `<span class="search-result-rating">⭐ ${result.rating}</span>` : ''}
                        <span class="search-result-source">TMDB</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    directorSearchResults.innerHTML += itemsHtml;
    directorSearchResults.classList.add('active');

    directorSearchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            directorSearchResults.classList.remove('active');
            selectSearchResult(item.dataset.id, item.dataset.source, item.dataset.mediaType);
        });
    });
}
```

---

## 6) CSS used by the director UI

**File:** `client/styles.css`

```css
/* Director search */
.director-search-group {
    position: relative;
}

.search-director-btn {
    padding: var(--space-sm);
}

.search-director-btn svg {
    width: 14px;
    height: 14px;
}

.director-known-for {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: italic;
    opacity: 0.8;
}

.director-filmography-header {
    padding: var(--space-sm) var(--space-md);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent-blue);
    border-bottom: 1px solid var(--border-color);
    letter-spacing: 0.02em;
}
```

---

## 7) How to safely modify this feature

### Change number of director candidates shown
In `searchForDirector()`, update:
```js
.slice(0, 8)
```

### Change number of filmography titles shown
In `showDirectorFilmography()`, update:
```js
.slice(0, 20)
```

### Include TV episodes or other crew jobs
Right now filmography filters with:
```js
.filter(c => c.job === 'Director')
```
If you want more roles (example):
```js
.filter(c => c.job === 'Director' || c.job === 'Screenplay')
```

### Prefer movie-only or series-only
Filter `data.crew` further using `c.media_type`:
```js
.filter(c => c.media_type === 'movie')
```

### Change ordering
Current sort is newest first by date string:
```js
return db.localeCompare(da);
```
Reverse this for oldest first:
```js
return da.localeCompare(db);
```

---

## 8) Common pitfalls

- **No TMDB key available**: Director search intentionally fails with toast if neither server nor client TMDB key exists.
- **Empty images**: `profile_path` and `poster_path` can be null; placeholder is expected.
- **Duplicates in filmography**: handled with `seen` set keyed by TMDB id.
- **XSS risk in dynamic HTML**: text values are wrapped with `escapeHtml(...)` before rendering.

---

## 9) Quick test checklist

1. Open Add New modal.
2. Enter director name in Director field.
3. Click director search icon.
4. Select a director result.
5. Select one filmography title.
6. Confirm title/year/type/poster/etc auto-fill.
7. Save and confirm item appears in list correctly.

