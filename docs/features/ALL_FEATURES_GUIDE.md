# Watchlist: All Features Guide (Code + How to Modify)

This guide documents **all major features** in the project and where their code lives, so an intermediate developer can maintain and extend the app safely.

It complements `README.md` by focusing on **implementation-level** details.

---

## 0) Project map

Core files:
- `client/index.html` - UI structure (modals, forms, controls)
- `client/styles.css` - styling and layout
- `client/app.js` - all client logic (state, rendering, import, search, save)
- `server/index.js` - Express API (TMDB/OMDB proxies, config, enrich, sync)
- `supabase-watchlists.sql` - DB schema for cloud sync

Run scripts (`package.json`):
- `npm start` / `npm run dev` -> runs `server/index.js`
- `npm run client` -> static client only
- `npm run build` / `npm run vercel-build` -> copies `client/` to `public/`

---

## 1) App state + startup flow

### What it does
Initializes list mode/profile, loads API config, loads watchlist data, and renders UI.

### Where
- `client/app.js`
  - `loadWatchlist()` - load from cloud/local
  - `saveWatchlist()` - persist changes
  - `renderWatchlist()` - card rendering
  - `updateStats()` - counters
  - `filterAndSortWatchlist()` - search/filter/sort pipeline

### Key idea
UI always renders from the in-memory array (`watchlist`). Save/update functions mutate array -> save -> rerender.

---

## 2) Profiles (`?p=`) + shared list (`?list=shared`)

### What it does
Supports separate personal lists and one shared watch-together list.

### Where
- `client/app.js`
  - `openProfileModal()`
  - `copyProfileLink()`
  - list-mode/profile slug helpers (top of file)

### Cloud behavior
- Profile/shared slug is used as key for `/api/sync/:slug`
- Without cloud sync, slug changes the localStorage key namespace.

---

## 3) Add/Edit title (manual CRUD)

### What it does
Open modal, fill fields, save new or update existing item, prevent duplicates by title/year.

### Where
- `client/app.js`
  - `openModal(id = null)`
  - `handleFormSubmit(e)`

### Important implementation detail
`handleFormSubmit` builds `formData` from modal inputs and merges with existing item when editing/duplicate.

Example (simplified):
```js
const formData = {
  title: document.getElementById('title').value.trim(),
  year: parseInt(document.getElementById('year').value) || null,
  type: document.getElementById('type').value,
  status: document.getElementById('status').value,
  genre: document.getElementById('genre').value.trim(),
  director: (document.getElementById('director')?.value || '').trim(),
  notes: document.getElementById('notes').value.trim()
};
```

If you add new fields:
1. add input in `client/index.html`
2. add field capture in `handleFormSubmit`
3. render field in card UI

---

## 4) Search by title + auto-fetch details

### What it does
From Add modal title field:
1. search TMDB first
2. fallback OMDB
3. user picks result
4. app fetches details and auto-fills form fields

### Where
- `client/app.js`
  - `searchForTitle()`
  - `renderSearchResults(results)`
  - `selectSearchResult(id, source, mediaType)`
  - helper APIs:
    - `searchTMDB(...)`
    - `searchOMDB(...)`
    - `getTMDBDetails(...)`
    - `getOMDBDetails(...)`
    - `getOMDBByTitle(...)`

### Key integration behavior
- For TMDB result selection, director comes from TMDB crew and can fallback to OMDB director.
- OMDB access check supports both server-provided key and client-entered key.

---

## 5) Search by director + pick from filmography

### What it does
Dedicated director search input in Add modal:
1. search person on TMDB
2. show matching directors
3. click a director
4. load directed titles
5. click a title -> reuse normal `selectSearchResult(...)`

### Where
- `client/index.html`
  - `#director`, `#searchDirectorBtn`, `#directorSearchResults`
- `client/app.js`
  - `searchForDirector()`
  - `renderDirectorResults(people)`
  - `showDirectorFilmography(personId, directorName)`
- `server/index.js`
  - `GET /api/tmdb/search/person`
  - `GET /api/tmdb/person/:id/combined_credits`

### Why this design is good
No duplicate fill logic: filmography click goes through `selectSearchResult`, so all existing enrichment logic remains centralized.

---

## 6) Import system

### Supported import types
- Letterboxd CSV
- IMDb CSV
- custom CSV mapping
- paste titles parser
- JSON backup import

### Where
- `client/app.js`
  - `openImportModal()`
  - `parseCSV(...)`
  - `parseCSVLine(...)`
  - paste parser: `parseTitleAndYearFromPaste(...)`
  - JSON backup: `importBackupFromJsonFile(file)`

### Behavior
Import preview transforms rows into watchlist item shape, then merge/adds items and triggers save.

---

## 7) Bulk enrichment (post-import and manual)

### What it does
Fills missing poster/ratings/metadata in batches.

### Where
- Client: `client/app.js`
  - `bulkFetchDetails(options = {})`
- Server: `server/index.js`
  - `POST /api/enrich-batch`

### Why server route matters
Batch endpoint does parallel upstream API calls server-side (faster and avoids exposing keys).

---

## 8) Episodes / series extras

### What it does
Series-specific episode tracking with normalization/sorting helpers.

### Where
- `client/app.js`
  - `normalizeItemEpisodes(item)`
  - `sortEpisodesList(eps)`
  - series-specific UI/action functions near these helpers

### Practical note
When changing series data shape, update normalize/sort helpers first to avoid inconsistent saved data.

---

## 9) Filters, search, sort, and view mode

### What it does
- Search bar filtering
- status/type filters
- sorting
- list/tile view mode

### Where
- `client/app.js`
  - `filterAndSortWatchlist()`
  - `sortWatchlistItems(items)`
  - `setViewMode(mode)`
  - `renderWatchlist()`

---

## 10) Settings + API keys

### What it does
Stores optional client-side API keys in localStorage and reports status.

### Where
- `client/app.js`
  - `openSettingsModal()`
  - OMDB/TMDB key save handlers

### Runtime config source
- `GET /api/config` from server returns:
  - `hasOmdbKey`
  - `hasTmdbKey`
  - `hasCloudSync`

Server endpoint:
```js
app.get('/api/config', (req, res) => {
  res.json({
    hasOmdbKey: !!OMDB_API_KEY,
    hasTmdbKey: !!TMDB_API_KEY,
    hasCloudSync: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY))
  });
});
```

---

## 11) Data export/import backups

### What it does
- JSON export/import for manual backup/migration
- CSV export of watchlist

### Where
- `client/app.js`
  - `exportData()`
  - `exportWatchlistCsv()`
  - `importBackupFromJsonFile(file)`

---

## 12) Cloud sync (Supabase)

### What it does
Persists list JSON per slug in Supabase.

### Server routes
In `server/index.js`:
- `GET /api/sync/:slug`
- `PUT /api/sync/:slug`

### Flow
Client loads from `/api/sync/:slug` when cloud enabled; otherwise localStorage only.

---

## 13) Server API list (complete)

From `server/index.js`:
- `GET /api/omdb`
- `GET /api/tmdb/tv/:id/season/:seasonNumber`
- `GET /api/tmdb/search`
- `GET /api/tmdb/search/tv`
- `GET /api/tmdb/search/person`
- `GET /api/tmdb/person/:id/combined_credits`
- `GET /api/tmdb/:mediaType/:id`
- `POST /api/enrich-batch`
- `GET /api/config`
- `GET /api/sync/:slug`
- `PUT /api/sync/:slug`

---

## 14) UI structure map (important IDs)

In `client/index.html`:
- Add/Edit form: `#watchlistForm`
- Title search: `#title`, `#searchTitleBtn`, `#searchResults`
- Director search: `#director`, `#searchDirectorBtn`, `#directorSearchResults`
- Hidden edit id: `#editId`
- Type/status: `#type`, `#status`
- Ratings: `#myRating`, `#imdbRating`, `#rtRating`

If any ID changes, update corresponding `document.getElementById(...)` references in `app.js`.

---

## 15) CSS areas you will touch often

In `client/styles.css`:
- card layout
- modal styles
- search dropdown styles (`.search-results`, `.search-result-item`, etc.)
- director search styles (`.director-search-group`, `.search-director-btn`, `.director-known-for`)

---

## 16) Safe extension recipes

### Add a new metadata field (example: `language`)
1. Add input in `client/index.html`
2. Capture in `handleFormSubmit`
3. Fill in `openModal` edit path
4. Populate in `selectSearchResult` (if API provides)
5. Render on card
6. Include in CSV export/import mapping if needed

### Add a new external provider
1. Add server proxy route in `server/index.js`
2. Add client fetch helper
3. Merge into `selectSearchResult` enrichment pipeline
4. Add settings status display if key-based

### Change dedupe behavior
Check duplicate logic inside `handleFormSubmit` where it calls duplicate index helpers.

---

## 17) Debug checklist (feature-by-feature)

When a feature breaks, check in this order:
1. UI IDs still match JS selectors?
2. Event listener attached?
3. API key path available (`/api/config`)?
4. Endpoint returns expected payload shape?
5. Field included in `formData` on submit?
6. Saved item shape compatible with render and filters?

---

## 18) Keep this guide updated

If you add/remove a major feature:
- update sections 13 and 14 first (API + UI IDs)
- then update the matching feature section
- add one extension recipe if the new feature is meant to be customizable

---

## 19) Deep dive: data model (watchlist item shape)

Most features rely on a common item shape. If this changes, multiple subsystems must be updated together.

Typical item:

```js
{
  id: "string-unique-id",
  title: "Dune: Part Two",
  year: 2024,
  type: "movie" | "series",
  status: "want-to-watch" | "watching" | "watched",
  genre: "Sci-Fi, Adventure",
  director: "Denis Villeneuve",
  myRating: 8.5,              // user rating
  imdbRating: 8.4,            // external rating
  rtRating: 92,               // external rating
  posterUrl: "https://...",
  imdbLink: "https://www.imdb.com/title/tt...",
  letterboxdLink: "https://...",
  rottenTomatoesLink: "https://...",
  justWatchLink: "https://...",
  notes: "string",
  dateAdded: "ISO string",
  tmdbTvId: 12345,            // series only, optional
  episodes: []                // series only
}
```

### Where this shape is enforced
- creation/update: `handleFormSubmit(...)`
- normalization: `normalizeItemEpisodes(...)`
- rendering: `renderWatchlist()`
- filtering/sorting: `filterAndSortWatchlist()`, `sortWatchlistItems(...)`
- import/export: parser + export functions
- cloud sync: `/api/sync/:slug` data payload

---

## 20) Deep dive: startup sequence

```mermaid
flowchart TD
  appLoad[App boots] --> modeInit[Resolve list mode and profile slug]
  modeInit --> configFetch[GET /api/config]
  configFetch --> loadData[loadWatchlist()]
  loadData --> dataSource{Cloud sync enabled?}
  dataSource -->|yes| syncGet[GET /api/sync/:slug]
  dataSource -->|no| localLoad[Read localStorage key]
  syncGet --> normalize[Normalize items]
  localLoad --> normalize
  normalize --> render[renderWatchlist()]
  render --> stats[updateStats()]
```

### Debug tips
- If feature flags seem wrong, inspect `/api/config` in Network tab first.
- If data differs per browser unexpectedly, check whether cloud sync is disabled and app is using localStorage only.

---

## 21) Deep dive: Add/Edit save pipeline

When user clicks Save in modal:

1. `handleFormSubmit(e)` prevents default submit.
2. Builds `formData` from DOM inputs.
3. Resolves duplicate/edit target:
   - edit path by `editId`
   - add path checks duplicate title/year
4. Merges or inserts item.
5. Normalizes series episode structure.
6. Calls `saveWatchlist()` and rerenders.

### Common bug source
Field appears in modal but not saved -> field missing from `formData` object (this already happened with `director` before).

### Safe checklist when adding a new form field
1. input exists with stable ID in `index.html`
2. read from DOM in `handleFormSubmit`
3. set value in edit flow (`openModal(id)`)
4. reset behavior on new item flow
5. render value in card
6. include in import/export if needed

---

## 22) Deep dive: title search + enrichment

### Search stage
- function: `searchForTitle()`
- logic:
  - validate input
  - validate API availability
  - try TMDB (`searchTMDB`) first
  - fallback OMDB (`searchOMDB`) if TMDB empty
  - map into unified result shape
  - render list via `renderSearchResults(...)`

### Select stage
- function: `selectSearchResult(id, source, mediaType)`
- logic:
  - fetch full details for selected result
  - enrich ratings/poster/director
  - fill modal inputs

### Important detail
OMDB enrichment should use both key sources:
- server key (`serverHasOmdbKey`)
- client key (`omdbApiKey`)

This is why availability checks use patterns like:
```js
const canOmdb = serverHasOmdbKey || omdbApiKey;
```

---

## 23) Deep dive: director search workflow

Director search is independent UI but reuses title fill logic.

```mermaid
flowchart TD
  directorInput[Type director name] --> personSearch[searchForDirector()]
  personSearch --> apiPerson[GET /api/tmdb/search/person]
  apiPerson --> renderPeople[renderDirectorResults()]
  renderPeople --> choosePerson[Click one director]
  choosePerson --> creditsApi[GET /api/tmdb/person/:id/combined_credits]
  creditsApi --> filterDirected[Filter crew where job is Director]
  filterDirected --> renderTitles[Render directed titles]
  renderTitles --> chooseTitle[Click directed title]
  chooseTitle --> existingFlow[selectSearchResult()]
```

### Why this is maintainable
- one source of truth for final form fill = `selectSearchResult(...)`
- director search only discovers candidate titles

---

## 24) Deep dive: import architecture

Import is effectively a multi-adapter system:

- **CSV parser layer**
  - `parseCSV(...)`
  - `parseCSVLine(...)`
- **source-specific mapping**
  - Letterboxd/IMDb/custom tabs
- **normalization layer**
  - coerce year/rating/type/status defaults
- **merge layer**
  - dedupe strategy + update existing where needed
- **optional enrich layer**
  - post-import enrichment via API fetch

### If you add a new source format
1. add a mapper that outputs standard item shape
2. keep mapper side-effect free (just transform)
3. pass transformed rows through existing merge/save pipeline

---

## 25) Deep dive: bulk enrichment strategy

`bulkFetchDetails(options)` fills missing metadata over entire list.

Primary strategy:
- if server keys available -> use `POST /api/enrich-batch`
- otherwise run client-side requests (slower and rate-limit prone)

### Why batch endpoint exists
- reduces round trips
- allows parallelized upstream calls server-side
- avoids exposing keys

### Extend safely
When adding a new enriched field:
1. update server batch response shape
2. update client merge logic in `bulkFetchDetails`
3. guard with `forceRefreshAll` and "missing value" checks

---

## 26) Deep dive: local storage and sync keys

Conceptual key categories:
- active profile/list mode
- watchlist data cache per slug
- API keys (if entered in settings)
- view preferences (list/tiles etc.)

### Practical rule
Never rename storage keys casually. If a rename is required, add migration logic:
1. read old key
2. write new key
3. remove old key after successful migration

---

## 27) Deep dive: server API payload shapes

### `GET /api/config`
Response:
```json
{
  "hasOmdbKey": true,
  "hasTmdbKey": true,
  "hasCloudSync": true
}
```

### `GET /api/sync/:slug`
Expected response (conceptual):
```json
{
  "data": [/* watchlist items */],
  "updated_at": "timestamp"
}
```

### `PUT /api/sync/:slug`
Request body (conceptual):
```json
{
  "data": [/* watchlist items */]
}
```

### `POST /api/enrich-batch`
Request body (conceptual):
```json
{
  "items": [
    { "title": "Dune: Part Two", "year": 2024, "type": "movie" }
  ],
  "options": { "forceRefreshAll": false }
}
```

Response (conceptual):
```json
{
  "items": [/* enriched items */],
  "updated": 12,
  "failed": 3
}
```

---

## 28) Deep dive: rendering and performance notes

### Current rendering style
- full render pass after changes (`renderWatchlist()`)
- search/filter computed in JS (`filterAndSortWatchlist()`)

### Performance pressure points
- very large lists + frequent re-render
- repeated DOM queries in tight loops
- repeated expensive sorting on each keystroke

### Safe optimizations
1. debounce search input (already done for primary search bar)
2. avoid rebuilding unchanged fragments
3. cache expensive derived data where possible
4. avoid sync layout thrashing in loops

---

## 29) Deep dive: error handling patterns

Client pattern:
- `try/catch` around network calls
- show toast on user-facing failure
- fallback behavior where possible

Server pattern:
- validate input early
- return 4xx for config/input issues
- return 500 for upstream/unknown errors
- log root cause with route-specific prefix

### Good practice
Keep errors actionable:
- "TMDB key missing" (action: set key)
- "No directed titles found" (action: try another director)

---

## 30) Deep dive: test matrix (manual)

### A) Add/Edit
- add movie
- add series
- edit existing
- duplicate title/year behavior
- director field persists after save/edit

### B) Search flows
- title search TMDB success
- title search OMDB fallback
- director person search
- director filmography selection -> form fill

### C) Import/export
- import Letterboxd
- import IMDb
- import custom CSV
- paste titles
- export JSON + re-import

### D) Sync/storage
- with cloud enabled: data shared across browsers with same slug
- without cloud: data isolated per browser

### E) Bulk enrichment
- missing fields get filled
- force refresh updates existing fields
- behavior with no keys

---

## 31) Deep dive: refactor boundaries (what to keep separate)

To avoid regressions, keep these boundaries:

1. **Discovery vs Fill**
   - discovery: search functions
   - fill: `selectSearchResult`
2. **Transform vs Side effects**
   - parsing/mapping functions should not save directly
3. **Client UI vs Server proxy**
   - client should not carry server secret logic
4. **Storage abstraction**
   - centralize save/load logic; avoid random `localStorage` writes in unrelated code

---

## 32) Recommended next docs split (optional)

If this file grows too large, split into:
- `docs/features/01-core-state.md`
- `docs/features/02-search-and-enrichment.md`
- `docs/features/03-import-and-export.md`
- `docs/features/04-sync-and-server-api.md`
- `docs/features/05-ui-and-styling.md`

Keep this file as an index linking to those deeper docs.

