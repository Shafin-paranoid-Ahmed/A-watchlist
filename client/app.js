// ============================================
// WATCHLIST APP - Main JavaScript
// ============================================

// Storage keys
const OMDB_API_KEY_STORAGE = 'omdb_api_key';
const TMDB_API_KEY_STORAGE = 'tmdb_api_key';

// API URLs
const OMDB_BASE_URL = 'https://www.omdbapi.com/';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

// Server-side API config (for when API keys are in .env)
let serverHasOmdbKey = false;
let serverHasTmdbKey = false;
let hasCloudSync = false;

const PROFILE_STORAGE_KEY = 'watchlist_active_profile';
const LEGACY_STORAGE_KEY = 'watchlist_data';
const LIST_MODE_KEY = 'watchlist_list_mode';
const SHARED_LOCAL_KEY = 'watchlist_shared_v1';
let syncPushTimer = null;
/** @type {'personal' | 'shared'} */
let listMode = 'personal';
let sharedListSlug = 'watch-together';

// DOM Elements
const watchlistGrid = document.getElementById('watchlistGrid');
const emptyState = document.getElementById('emptyState');
const modalOverlay = document.getElementById('modalOverlay');
const watchlistForm = document.getElementById('watchlistForm');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const addNewBtn = document.getElementById('addNewBtn');
const closeModalBtn = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const toast = document.getElementById('toast');

// Import Modal Elements
const importBtn = document.getElementById('importBtn');
const importModalOverlay = document.getElementById('importModalOverlay');
const closeImportModalBtn = document.getElementById('closeImportModal');
const importTabs = document.querySelectorAll('.import-tab');
const instructionPanels = document.querySelectorAll('.instruction-panel');
const importDropzone = document.getElementById('importDropzone');
const importFile = document.getElementById('importFile');
const importPreview = document.getElementById('importPreview');
const previewTable = document.getElementById('previewTable');
const cancelImportBtn = document.getElementById('cancelImport');
const confirmImportBtn = document.getElementById('confirmImport');

// Settings Modal Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const closeSettingsModalBtn = document.getElementById('closeSettingsModal');
const omdbApiKeyInput = document.getElementById('omdbApiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const exportDataBtn = document.getElementById('exportDataBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const bulkFetchBtn = document.getElementById('bulkFetchBtn');
const bulkRefetchAllBtn = document.getElementById('bulkRefetchAllBtn');

// Search Elements
const searchTitleBtn = document.getElementById('searchTitleBtn');
const searchResults = document.getElementById('searchResults');

// Stats elements
const totalCount = document.getElementById('totalCount');
const watchedCount = document.getElementById('watchedCount');
const watchingCount = document.getElementById('watchingCount');
const wantToWatchCount = document.getElementById('wantToWatchCount');

// State
let watchlist = [];
let currentFilter = 'all';
/** Normalized lowercase search string (trimmed, collapsed spaces) */
let searchQuery = '';
/** When not searching, controls card order (persisted) */
let sortMode = 'added-desc';
let editingId = null;
let currentImportSource = 'letterboxd';
let pendingImports = [];
let omdbApiKey = '';
let tmdbApiKey = '';
let detectedImportStatus = 'watched';

const SEARCH_DEBOUNCE_MS = 220;
let searchDebounceTimer = null;

const SORT_MODE_STORAGE_KEY = 'watchlist_sort_mode';
const VIEW_MODE_STORAGE_KEY = 'watchlist_view_mode';

const ENRICH_BATCH_SIZE = 120;

/** @type {'list' | 'tiles'} */
let viewMode = 'list';

const TMDB_SEASON_HYDRATE_DELAY_MS = 130;
/** TV details + per-season fetches, across all series in one hydrate pass */
const TMDB_SEASON_HYDRATE_MAX_FETCHES = 180;
/** Max series we try to resolve (search + seasons) per hydrate pass */
const TMDB_SEASON_HYDRATE_MAX_RESOLVE_ATTEMPTS = 40;
/** Cap TMDB season requests per show (Simpsons-scale shows) */
const TMDB_MAX_SEASONS_PER_SHOW = 50;

let tmdbSeasonHydrateRunning = false;

// ============================================
// PROFILES (you vs partner — separate lists, same site)
// ============================================

function normalizeProfileSlug(raw) {
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

function initProfileFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p') || params.get('profile');
    if (p) {
        const s = normalizeProfileSlug(p);
        if (s) localStorage.setItem(PROFILE_STORAGE_KEY, s);
    }
}

function getActiveProfileSlug() {
    return localStorage.getItem(PROFILE_STORAGE_KEY) || 'you';
}

function getLocalStorageKey() {
    return listMode === 'shared' ? SHARED_LOCAL_KEY : `watchlist_data_v2_${getActiveProfileSlug()}`;
}

/** Slug used for Supabase row: personal profile vs fixed shared playlist */
function getSyncSlug() {
    return listMode === 'shared' ? sharedListSlug : getActiveProfileSlug();
}

function initListModeFromUrl() {
    const u = new URLSearchParams(window.location.search);
    if (u.get('list') === 'shared') {
        listMode = 'shared';
        localStorage.setItem(LIST_MODE_KEY, 'shared');
    } else if (u.get('list') === 'personal') {
        listMode = 'personal';
        localStorage.setItem(LIST_MODE_KEY, 'personal');
    } else {
        listMode = localStorage.getItem(LIST_MODE_KEY) || 'personal';
        if (listMode !== 'personal' && listMode !== 'shared') listMode = 'personal';
    }
}

function updateListModeTabs() {
    document.querySelectorAll('.list-mode-tab').forEach((tab) => {
        const active = tab.dataset.mode === listMode;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

async function switchListMode(mode) {
    if (mode !== 'personal' && mode !== 'shared') return;
    if (listMode === mode) return;
    listMode = mode;
    localStorage.setItem(LIST_MODE_KEY, mode);
    clearTimeout(syncPushTimer);
    syncPushTimer = null;

    const url = new URL(window.location.href);
    if (mode === 'shared') url.searchParams.set('list', 'shared');
    else url.searchParams.delete('list');
    window.history.replaceState({}, '', url);

    await loadWatchlist();
    updateListModeTabs();
    updateProfileBarForMode();
    updateEmptyStateCopy();
    renderWatchlist();
    updateStats();
}

function updateProfileBar() {
    const el = document.getElementById('profileSlugDisplay');
    if (el && listMode === 'personal') el.textContent = getActiveProfileSlug();
}

function updateProfileBarForMode() {
    const bar = document.getElementById('profileBar');
    const switchBtn = document.getElementById('switchProfileBtn');
    const label = bar?.querySelector('.profile-label');
    const slugEl = document.getElementById('profileSlugDisplay');
    const copyBtn = document.getElementById('copyProfileLinkBtn');
    if (!bar) return;

    if (listMode === 'shared') {
        bar.classList.add('profile-bar--shared');
        if (label) label.textContent = 'Together';
        if (slugEl) slugEl.textContent = 'One queue for both of you';
        if (switchBtn) switchBtn.style.display = 'none';
        if (copyBtn) {
            copyBtn.textContent = 'Copy together link';
            copyBtn.title = 'Share this link — same list for date night';
        }
    } else {
        bar.classList.remove('profile-bar--shared');
        if (label) label.textContent = 'List profile';
        if (switchBtn) switchBtn.style.display = '';
        if (copyBtn) {
            copyBtn.textContent = 'Copy link';
            copyBtn.title = 'Share this list only';
        }
        updateProfileBar();
    }
}

function updateEmptyStateCopy() {
    const title = document.getElementById('emptyStateTitle');
    const text = document.getElementById('emptyStateText');
    const icon = document.getElementById('emptyStateIcon');
    if (!title) return;
    if (listMode === 'shared') {
        if (icon) icon.textContent = '💑';
        title.textContent = 'Your together list is empty';
        text.textContent = 'Add movies or shows you want to watch as a pair. You both see the same playlist (with cloud sync on).';
    } else {
        if (icon) icon.textContent = '🎥';
        title.textContent = 'Your watchlist is empty';
        text.textContent = 'Start adding movies and series to track your entertainment journey!';
    }
}

function openProfileModal() {
    const input = document.getElementById('profileSlugInput');
    if (input) input.value = getActiveProfileSlug();
    document.getElementById('profileModalOverlay')?.classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModalOverlay')?.classList.remove('active');
}

function applyProfileSwitch() {
    const raw = document.getElementById('profileSlugInput')?.value || '';
    const s = normalizeProfileSlug(raw);
    if (!s) {
        showToast('Use 1–48 characters: letters, numbers, dashes only', 'error');
        return;
    }
    if (s === sharedListSlug) {
        showToast(`"${s}" is reserved for Watch together. Pick another profile id.`, 'error');
        return;
    }
    localStorage.setItem(PROFILE_STORAGE_KEY, s);
    const url = new URL(window.location.href);
    url.searchParams.set('p', s);
    window.history.replaceState({}, '', url);
    closeProfileModal();
    window.location.reload();
}

function copyProfileLink() {
    const base = `${window.location.origin}${window.location.pathname}`;
    const share =
        listMode === 'shared'
            ? `${base}?list=shared`
            : `${base}?p=${encodeURIComponent(getActiveProfileSlug())}`;
    const onCopied = () => {
        if (!hasCloudSync) {
            showToast(
                'Link copied. Without Supabase, that URL is empty on her phone — data stays in your browser. Add cloud sync (red banner) or send a JSON backup from Settings.',
                'success'
            );
        } else if (listMode === 'shared') {
            showToast('Together link copied — same queue for everyone with sync on', 'success');
        } else {
            showToast('Link copied — she’ll see your titles after you both use the same ?p= with cloud sync on', 'success');
        }
    };
    navigator.clipboard.writeText(share).then(onCopied, () => prompt('Copy this link:', share));
}

// ============================================
// INITIALIZATION
// ============================================

function syncViewToggleUi() {
    document.getElementById('viewListBtn')?.classList.toggle('active', viewMode === 'list');
    document.getElementById('viewTilesBtn')?.classList.toggle('active', viewMode === 'tiles');
}

function setViewMode(mode) {
    viewMode = mode === 'tiles' ? 'tiles' : 'list';
    try {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch (_) {
        /* ignore */
    }
    syncViewToggleUi();
    renderWatchlist();
}

document.addEventListener('DOMContentLoaded', async () => {
    viewMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'tiles' ? 'tiles' : 'list';
    syncViewToggleUi();
    initProfileFromUrl();
    initListModeFromUrl();
    loadApiKey();
    await checkServerConfig();
    await loadWatchlist();
    updateListModeTabs();
    updateProfileBar();
    updateProfileBarForMode();
    updateEmptyStateCopy();
    renderWatchlist();
    updateStats();
    setupEventListeners();
    void hydrateTmdbSeasonGuides();
});

// Check if server has API keys configured
async function checkServerConfig() {
    const banner = document.getElementById('apiUnreachableBanner');
    const hideBanner = () => {
        if (banner) banner.style.display = 'none';
    };
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            serverHasOmdbKey = config.hasOmdbKey;
            serverHasTmdbKey = config.hasTmdbKey;
            hasCloudSync = !!config.hasCloudSync;
            if (config.sharedListSlug) {
                sharedListSlug = String(config.sharedListSlug).toLowerCase().trim() || 'watch-together';
            }
            console.log('Server API config:', config);
            hideBanner();
        } else {
            if (banner) banner.style.display = 'block';
            console.warn('/api/config failed:', response.status, '(backend missing or wrong Vercel routing)');
        }
    } catch (error) {
        if (banner) banner.style.display = 'block';
        console.warn('Using client-side API keys — /api/config unreachable', error);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Add new button
    addNewBtn.addEventListener('click', () => openModal());
    
    // Close modal
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    // Form submission
    watchlistForm.addEventListener('submit', handleFormSubmit);
    document.getElementById('type')?.addEventListener('change', updateSeriesFormHint);
    
    // Search (debounced — avoids repainting the grid on every keystroke)
    searchInput.addEventListener('input', (e) => {
        const raw = e.target.value;
        const apply = () => {
            searchQuery = normalizeSearchQuery(raw);
            renderWatchlist();
        };
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        if (normalizeSearchQuery(raw) === '') {
            apply();
            return;
        }
        searchDebounceTimer = setTimeout(apply, SEARCH_DEBOUNCE_MS);
    });

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        const saved = localStorage.getItem(SORT_MODE_STORAGE_KEY);
        if (saved && [...sortSelect.options].some(o => o.value === saved)) {
            sortMode = saved;
            sortSelect.value = saved;
        }
        sortSelect.addEventListener('change', () => {
            sortMode = sortSelect.value;
            localStorage.setItem(SORT_MODE_STORAGE_KEY, sortMode);
            renderWatchlist();
        });
    }
    
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderWatchlist();
        });
    });

    watchlistGrid.addEventListener('change', handleEpisodeGridChange);
    watchlistGrid.addEventListener('click', handleEpisodeGridClick);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeImportModal();
            closeProfileModal();
        }
        if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            openModal();
        }
    });
    
    // Import modal events
    importBtn.addEventListener('click', openImportModal);
    closeImportModalBtn.addEventListener('click', closeImportModal);
    importModalOverlay.addEventListener('click', (e) => {
        if (e.target === importModalOverlay) closeImportModal();
    });
    
    // Import tabs
    importTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            importTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentImportSource = tab.dataset.source;

            instructionPanels.forEach(panel => {
                panel.classList.toggle('active', panel.dataset.source === currentImportSource);
            });

            const pastePanel = document.getElementById('importPastePanel');
            const isPaste = currentImportSource === 'paste';
            importDropzone.style.display = isPaste ? 'none' : 'block';
            if (pastePanel) pastePanel.style.display = isPaste ? 'block' : 'none';
        });
    });
    
    // File upload
    importDropzone.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    importDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        importDropzone.classList.add('dragover');
    });
    importDropzone.addEventListener('dragleave', () => {
        importDropzone.classList.remove('dragover');
    });
    importDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        importDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            processFile(file);
        } else {
            showToast('Please upload a CSV file', 'error');
        }
    });
    
    document.getElementById('parsePasteTitlesBtn')?.addEventListener('click', handlePasteTitlesPreview);
    document.getElementById('pasteTitlesInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handlePasteTitlesPreview();
        }
    });

    // Import actions
    cancelImportBtn.addEventListener('click', () => resetImportState(false));
    confirmImportBtn.addEventListener('click', async () => {
        confirmImportBtn.disabled = true;
        try {
            await executeImport();
        } catch (e) {
            console.error(e);
            showToast('Import failed — check the console', 'error');
        } finally {
            confirmImportBtn.disabled = false;
        }
    });
    
    // Settings modal
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    settingsModalOverlay.addEventListener('click', (e) => {
        if (e.target === settingsModalOverlay) closeSettingsModal();
    });
    
    // API keys
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    omdbApiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
    
    document.getElementById('saveTmdbApiKey').addEventListener('click', saveTmdbApiKey);
    document.getElementById('tmdbApiKey').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveTmdbApiKey();
    });
    
    // Data management
    exportDataBtn.addEventListener('click', exportData);
    exportCsvBtn?.addEventListener('click', exportWatchlistCsv);
    document.getElementById('importBackupBtn')?.addEventListener('click', () => {
        document.getElementById('importBackupFile')?.click();
    });
    document.getElementById('importBackupFile')?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) importBackupFromJsonFile(f);
        e.target.value = '';
    });
    clearDataBtn.addEventListener('click', clearAllData);
    bulkFetchBtn.addEventListener('click', bulkFetchDetails);
    bulkRefetchAllBtn?.addEventListener('click', () => bulkFetchDetails({ forceRefreshAll: true }));

    document.getElementById('viewListBtn')?.addEventListener('click', () => setViewMode('list'));
    document.getElementById('viewTilesBtn')?.addEventListener('click', () => setViewMode('tiles'));
    
    // Title search
    searchTitleBtn.addEventListener('click', searchForTitle);
    document.getElementById('title').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchForTitle();
        }
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.title-search-group')) {
            searchResults.classList.remove('active');
        }
    });

    document.getElementById('copyProfileLinkBtn')?.addEventListener('click', copyProfileLink);
    document.getElementById('switchProfileBtn')?.addEventListener('click', openProfileModal);
    document.getElementById('closeProfileModal')?.addEventListener('click', closeProfileModal);
    document.getElementById('cancelProfileModal')?.addEventListener('click', closeProfileModal);
    document.getElementById('confirmProfileModal')?.addEventListener('click', applyProfileSwitch);
    document.getElementById('profileModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'profileModalOverlay') closeProfileModal();
    });

    document.querySelectorAll('.list-mode-tab').forEach((tab) => {
        tab.addEventListener('click', () => switchListMode(tab.dataset.mode));
    });
}

// ============================================
// DATA MANAGEMENT
// ============================================

async function loadWatchlist() {
    const slug = getSyncSlug();

    if (listMode === 'personal') {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy && !localStorage.getItem('watchlist_migrated_legacy')) {
            localStorage.setItem(getLocalStorageKey(), legacy);
            localStorage.setItem('watchlist_migrated_legacy', '1');
        }
    }

    if (hasCloudSync) {
        try {
            const r = await fetch(`/api/sync/${encodeURIComponent(slug)}`);
            if (r.ok) {
                const j = await r.json();
                if (Array.isArray(j.items)) {
                    const cloudItems = j.items;
                    let localItems = [];
                    try {
                        const localRaw = localStorage.getItem(getLocalStorageKey());
                        localItems = localRaw ? JSON.parse(localRaw) : [];
                    } catch (_) {
                        localItems = [];
                    }
                    if (
                        !Array.isArray(localItems) ||
                        localItems.some(x => typeof x !== 'object')
                    ) {
                        localItems = [];
                    }
                    // Supabase often has no row yet: API returns []. Don't wipe a full local list —
                    // keep local data and upload it so shared ?p= links work for others.
                    if (cloudItems.length === 0 && localItems.length > 0) {
                        watchlist = localItems;
                        normalizeWatchlistEpisodes();
                        localStorage.setItem(
                            getLocalStorageKey(),
                            JSON.stringify(watchlist)
                        );
                        scheduleCloudPush();
                        if (!sessionStorage.getItem('sync_seed_toast')) {
                            sessionStorage.setItem('sync_seed_toast', '1');
                            showToast(
                                'Saving your watchlist to the cloud so people with your link can see it…',
                                'success'
                            );
                        }
                        return;
                    }
                    watchlist = cloudItems;
                    normalizeWatchlistEpisodes();
                    localStorage.setItem(getLocalStorageKey(), JSON.stringify(watchlist));
                    return;
                }
            }
        } catch (e) {
            console.warn('Cloud load failed, using saved browser copy', e);
        }
    }

    const data = localStorage.getItem(getLocalStorageKey());
    watchlist = data ? JSON.parse(data) : [];
    normalizeWatchlistEpisodes();
}

function normalizeWatchlistEpisodes() {
    if (!Array.isArray(watchlist)) return;
    watchlist.forEach(normalizeItemEpisodes);
}

function normalizeItemEpisodes(item) {
    if (!item || item.type !== 'series') {
        if (item) {
            if ('episodes' in item) delete item.episodes;
            if ('tmdbTvId' in item) delete item.tmdbTvId;
            if ('tmdbSeason1Guide' in item) delete item.tmdbSeason1Guide;
            if ('tmdbSeasonGuides' in item) delete item.tmdbSeasonGuides;
            if ('tmdbTvShowMeta' in item) delete item.tmdbTvShowMeta;
        }
        return;
    }
    if (item.tmdbTvId != null) {
        const tid = parseInt(item.tmdbTvId, 10);
        item.tmdbTvId = Number.isFinite(tid) && tid > 0 ? tid : null;
    }

    if (item.tmdbSeason1Guide && typeof item.tmdbSeason1Guide === 'object') {
        if (Array.isArray(item.tmdbSeason1Guide.episodes)) {
            item.tmdbSeasonGuides = item.tmdbSeasonGuides && typeof item.tmdbSeasonGuides === 'object' ? item.tmdbSeasonGuides : {};
            if (!item.tmdbSeasonGuides['1']) {
                const gTv = parseInt(item.tmdbSeason1Guide.tmdbTvId, 10);
                item.tmdbSeasonGuides['1'] = {
                    fetchedAt:
                        typeof item.tmdbSeason1Guide.fetchedAt === 'string'
                            ? item.tmdbSeason1Guide.fetchedAt
                            : new Date().toISOString(),
                    tmdbTvId: Number.isFinite(gTv) ? gTv : item.tmdbTvId,
                    seasonNumber: 1,
                    episodes: item.tmdbSeason1Guide.episodes
                };
            }
        }
        delete item.tmdbSeason1Guide;
    }

    if (item.tmdbSeasonGuides && typeof item.tmdbSeasonGuides === 'object') {
        const next = {};
        for (const [k, v] of Object.entries(item.tmdbSeasonGuides)) {
            const sn = parseInt(k, 10);
            if (!Number.isFinite(sn) || sn < 1) continue;
            if (!v || typeof v !== 'object' || !Array.isArray(v.episodes)) continue;
            next[String(sn)] = {
                fetchedAt:
                    typeof v.fetchedAt === 'string' ? v.fetchedAt : new Date().toISOString(),
                tmdbTvId:
                    v.tmdbTvId != null
                        ? (() => {
                              const x = parseInt(v.tmdbTvId, 10);
                              return Number.isFinite(x) ? x : item.tmdbTvId;
                          })()
                        : item.tmdbTvId,
                seasonNumber: sn,
                episodes: v.episodes
                    .filter(ep => ep && Number.isFinite(Number(ep.episode_number)))
                    .map(ep => ({
                        episode_number: parseInt(ep.episode_number, 10),
                        name: typeof ep.name === 'string' ? ep.name : '',
                        air_date: typeof ep.air_date === 'string' ? ep.air_date : '',
                        runtime: ep.runtime != null ? ep.runtime : null
                    }))
            };
        }
        if (Object.keys(next).length) item.tmdbSeasonGuides = next;
        else delete item.tmdbSeasonGuides;
    }

    if (item.tmdbTvShowMeta && typeof item.tmdbTvShowMeta === 'object') {
        const nos = parseInt(item.tmdbTvShowMeta.numberOfSeasons, 10);
        const tvMeta = parseInt(item.tmdbTvShowMeta.tmdbTvId, 10);
        item.tmdbTvShowMeta = {
            fetchedAt:
                typeof item.tmdbTvShowMeta.fetchedAt === 'string'
                    ? item.tmdbTvShowMeta.fetchedAt
                    : new Date().toISOString(),
            tmdbTvId: Number.isFinite(tvMeta) ? tvMeta : item.tmdbTvId,
            numberOfSeasons: Number.isFinite(nos) && nos >= 1 ? nos : null
        };
        if (item.tmdbTvShowMeta.numberOfSeasons == null) delete item.tmdbTvShowMeta;
    }
    if (!Array.isArray(item.episodes)) {
        item.episodes = [];
        return;
    }
    item.episodes = item.episodes
        .filter(ep => ep && Number.isFinite(Number(ep.season)) && Number.isFinite(Number(ep.episode)))
        .map(ep => ({
            season: Math.max(1, parseInt(ep.season, 10)),
            episode: Math.max(1, parseInt(ep.episode, 10)),
            title: typeof ep.title === 'string' ? ep.title : '',
            watched: !!ep.watched
        }));
}

function getEpisodesArray(item) {
    if (!item || item.type !== 'series') return [];
    return Array.isArray(item.episodes) ? item.episodes : [];
}

function sortEpisodesList(eps) {
    return [...eps].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function groupEpisodesBySeason(eps) {
    const sorted = sortEpisodesList(eps);
    const map = new Map();
    for (const ep of sorted) {
        if (!map.has(ep.season)) map.set(ep.season, []);
        map.get(ep.season).push(ep);
    }
    return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([season, list]) => ({ season, episodes: list }));
}

function seasonWatchProgress(epsInSeason) {
    const total = epsInSeason.length;
    const watched = epsInSeason.filter(e => e.watched).length;
    return { watched, total };
}

function hydrateSeasonWatchCheckboxes() {
    document.querySelectorAll('.season-watched-cb').forEach(cb => {
        const itemId = cb.dataset.itemId;
        const season = parseInt(cb.dataset.season, 10);
        const item = watchlist.find(i => i.id === itemId);
        if (!item || !Array.isArray(item.episodes) || !Number.isFinite(season)) return;
        const eps = item.episodes.filter(e => e.season === season);
        if (eps.length === 0) return;
        const n = eps.filter(e => e.watched).length;
        cb.indeterminate = n > 0 && n < eps.length;
        cb.checked = n === eps.length;
    });
}

function syncSeasonCheckboxInCard(card, item, season) {
    if (!card || !item) return;
    const cb = card.querySelector(`.season-watched-cb[data-item-id="${item.id}"][data-season="${season}"]`);
    if (!cb) return;
    const eps = item.episodes.filter(e => e.season === season);
    if (eps.length === 0) return;
    const n = eps.filter(e => e.watched).length;
    cb.indeterminate = n > 0 && n < eps.length;
    cb.checked = n === eps.length;
    const prog = card.querySelector(`.episode-season-progress[data-season="${season}"]`);
    if (prog) prog.textContent = `${n}/${eps.length}`;
}

function refreshSeriesEpisodesUI(itemId) {
    const item = watchlist.find(i => i.id === itemId);
    const card = document.querySelector(`.card[data-id="${itemId}"]`);
    if (!item || !card || item.type !== 'series') return;
    const el = card.querySelector('.card-episodes');
    if (!el) return;
    const wasOpen = el.open;
    const openSeasons = new Set();
    card.querySelectorAll('.episode-season-details[open]').forEach(d => {
        const s = parseInt(d.dataset.season, 10);
        if (Number.isFinite(s)) openSeasons.add(s);
    });
    const temp = document.createElement('div');
    temp.innerHTML = renderSeriesEpisodesBlock(item).trim();
    const newEl = temp.firstElementChild;
    if (!newEl) return;
    el.replaceWith(newEl);
    newEl.open = wasOpen;
    newEl.querySelectorAll('.episode-season-details').forEach(d => {
        const s = parseInt(d.dataset.season, 10);
        if (openSeasons.has(s)) d.open = true;
    });
    hydrateSeasonWatchCheckboxes();
    updateCardEpisodeSummary(itemId);
}

function episodeSummaryText(item) {
    const eps = sortEpisodesList(getEpisodesArray(item));
    if (eps.length === 0) return 'Episodes — add S/E below';
    const watched = eps.filter(e => e.watched).length;
    return `Episodes · ${watched}/${eps.length} watched`;
}

function renderSeriesEpisodesBlock(item) {
    const eps = sortEpisodesList(getEpisodesArray(item));
    const groups = groupEpisodesBySeason(eps);
    let seasonsHtml = '';
    if (groups.length > 0) {
        seasonsHtml = groups
            .map(({ season, episodes: seasonEps }) => {
                const { watched, total } = seasonWatchProgress(seasonEps);
                const epRows = seasonEps
                    .map(ep => {
                        const t = ep.title
                            ? `<span class="episode-title">${escapeHtml(ep.title)}</span>`
                            : '';
                        return `
            <li class="episode-row ${ep.watched ? '' : 'episode-row--unwatched'}" data-season="${ep.season}" data-episode="${ep.episode}">
                <label class="episode-watched-label">
                    <input type="checkbox" class="episode-watched-cb" data-item-id="${item.id}" data-season="${ep.season}" data-episode="${ep.episode}" ${ep.watched ? 'checked' : ''}>
                    <span class="episode-se-label">E${ep.episode}</span>
                </label>
                ${t}
                <button type="button" class="episode-remove-btn" data-item-id="${item.id}" data-season="${ep.season}" data-episode="${ep.episode}" title="Remove">×</button>
            </li>`;
                    })
                    .join('');
                return `
        <div class="episode-season-wrap">
            <div class="episode-season-header-row">
                <details class="episode-season-details" data-season="${season}">
                    <summary class="episode-season-summary">
                        <span class="episode-season-summary-chev" aria-hidden="true">▸</span>
                        <span class="episode-season-title">Season ${season}</span>
                        <span class="episode-season-progress" data-season="${season}">${watched}/${total}</span>
                    </summary>
                    <ul class="episode-list episode-list--nested">${epRows}</ul>
                </details>
                <label class="episode-season-all-label" title="Mark whole season watched">
                    <input type="checkbox" class="season-watched-cb" data-item-id="${item.id}" data-season="${season}" aria-label="Mark entire season ${season} watched">
                </label>
            </div>
        </div>`;
            })
            .join('');
    }
    const tmdbReady = serverHasTmdbKey || !!tmdbApiKey;
    const emptyHint = tmdbReady
        ? '<div class="episode-list-empty episode-list-hint">Nothing logged yet. <strong>Season 1</strong> titles from TMDB fill in automatically when the app can match this series (refresh or use Bulk fetch if needed). You can still add S/E below.</div>'
        : '<div class="episode-list-empty episode-list-hint">Automatic episode lists use <strong>TMDB</strong>, not IMDB-only data. Set <code>TMDB_API_KEY</code> in the server <code>.env</code> or add a TMDB key in Settings, then reload.</div>';
    const listContent = seasonsHtml || emptyHint;
    return `
        <details class="card-episodes">
            <summary class="card-episodes-summary"><span class="card-episodes-summary-text">${escapeHtml(episodeSummaryText(item))}</span></summary>
            <div class="card-episodes-inner">
                <div class="episode-seasons">${listContent}</div>
                <div class="episode-add-row">
                    <input type="number" class="ep-add-season" min="1" step="1" placeholder="S" aria-label="Season" title="Season">
                    <span class="episode-add-x">×</span>
                    <input type="number" class="ep-add-episode" min="1" step="1" placeholder="E" aria-label="Episode" title="Episode">
                    <input type="text" class="ep-add-title" placeholder="Title (optional)" aria-label="Episode title">
                    <label class="ep-add-watched-label"><input type="checkbox" class="ep-add-watched"> Watched</label>
                    <button type="button" class="episode-add-submit-btn btn-episode-add" data-item-id="${item.id}">Add</button>
                </div>
            </div>
        </details>
    `;
}

function updateCardEpisodeSummary(itemId) {
    const item = watchlist.find(i => i.id === itemId);
    const card = document.querySelector(`.card[data-id="${itemId}"]`);
    if (!item || !card) return;
    const el = card.querySelector('.card-episodes-summary-text');
    if (el) el.textContent = episodeSummaryText(item);
}

function addOrUpdateEpisode(itemId, season, episode, title, watched) {
    const item = watchlist.find(i => i.id === itemId);
    if (!item || item.type !== 'series') return false;
    if (!Array.isArray(item.episodes)) item.episodes = [];
    const s = Math.max(1, parseInt(season, 10));
    const e = Math.max(1, parseInt(episode, 10));
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
    const existing = item.episodes.find(x => x.season === s && x.episode === e);
    if (existing) {
        existing.title = title != null ? String(title).trim() : existing.title;
        existing.watched = !!watched;
    } else {
        item.episodes.push({
            season: s,
            episode: e,
            title: title != null ? String(title).trim() : '',
            watched: !!watched
        });
    }
    return true;
}

function removeEpisode(itemId, season, episode) {
    const item = watchlist.find(i => i.id === itemId);
    if (!item || !Array.isArray(item.episodes)) return;
    const s = parseInt(season, 10);
    const ep = parseInt(episode, 10);
    item.episodes = item.episodes.filter(x => !(x.season === s && x.episode === ep));
}

function handleEpisodeGridChange(e) {
    const seasonCb = e.target.closest('.season-watched-cb');
    if (seasonCb) {
        const itemId = seasonCb.dataset.itemId;
        const season = parseInt(seasonCb.dataset.season, 10);
        const item = watchlist.find(i => i.id === itemId);
        if (!item || item.type !== 'series' || !Array.isArray(item.episodes)) return;
        if (!Number.isFinite(season)) return;
        if (!item.episodes.some(ep => ep.season === season)) return;
        const want = seasonCb.checked;
        seasonCb.indeterminate = false;
        for (const ep of item.episodes) {
            if (ep.season === season) ep.watched = want;
        }
        saveWatchlist();
        refreshSeriesEpisodesUI(itemId);
        updateStats();
        return;
    }

    const cb = e.target.closest('.episode-watched-cb');
    if (!cb) return;
    const itemId = cb.dataset.itemId;
    const season = parseInt(cb.dataset.season, 10);
    const episode = parseInt(cb.dataset.episode, 10);
    const item = watchlist.find(i => i.id === itemId);
    if (!item || item.type !== 'series') return;
    const ep = item.episodes?.find(x => x.season === season && x.episode === episode);
    if (ep) {
        ep.watched = cb.checked;
        saveWatchlist();
        const row = cb.closest('.episode-row');
        if (row) row.classList.toggle('episode-row--unwatched', !cb.checked);
        const card = cb.closest('.card');
        if (card) syncSeasonCheckboxInCard(card, item, season);
        updateCardEpisodeSummary(itemId);
    }
}

function handleEpisodeGridClick(e) {
    const addBtn = e.target.closest('.episode-add-submit-btn');
    if (addBtn) {
        e.preventDefault();
        const itemId = addBtn.dataset.itemId;
        const card = addBtn.closest('.card');
        if (!card) return;
        const sIn = card.querySelector('.ep-add-season');
        const eIn = card.querySelector('.ep-add-episode');
        const tIn = card.querySelector('.ep-add-title');
        const wIn = card.querySelector('.ep-add-watched');
        const season = parseInt(sIn?.value, 10);
        const episode = parseInt(eIn?.value, 10);
        if (!Number.isFinite(season) || !Number.isFinite(episode)) {
            showToast('Enter a valid season and episode number', 'error');
            return;
        }
        const ok = addOrUpdateEpisode(itemId, season, episode, tIn?.value || '', !!wIn?.checked);
        if (ok) {
            saveWatchlist();
            renderWatchlist();
            updateStats();
        }
        return;
    }
    const rm = e.target.closest('.episode-remove-btn');
    if (rm) {
        e.preventDefault();
        removeEpisode(rm.dataset.itemId, rm.dataset.season, rm.dataset.episode);
        saveWatchlist();
        renderWatchlist();
        updateStats();
    }
}

function saveWatchlist() {
    localStorage.setItem(getLocalStorageKey(), JSON.stringify(watchlist));
    scheduleCloudPush();
}

function scheduleCloudPush() {
    if (!hasCloudSync) return;
    clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(() => pushWatchlistToCloud(), 1200);
}

async function pushWatchlistToCloud() {
    if (!hasCloudSync) return;
    const slug = getSyncSlug();
    try {
        const r = await fetch(`/api/sync/${encodeURIComponent(slug)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: watchlist })
        });
        if (!r.ok) console.warn('Cloud save HTTP', r.status);
    } catch (e) {
        console.warn('Cloud save failed', e);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ============================================
// RENDERING
// ============================================

function renderWatchlist() {
    const filtered = filterAndSortWatchlist();

    if (watchlistGrid) {
        watchlistGrid.classList.toggle('watchlist-grid--tiles', viewMode === 'tiles');
    }

    if (filtered.length === 0) {
        watchlistGrid.innerHTML = '';
        emptyState.classList.add('visible');
        return;
    }
    
    emptyState.classList.remove('visible');
    watchlistGrid.innerHTML = filtered.map(item => createCard(item)).join('');
    hydrateSeasonWatchCheckboxes();
}

function normalizeSearchQuery(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function getSearchableBlob(item) {
    const parts = [
        item.title,
        item.genre,
        item.director,
        item.notes,
        item.imdbLink,
        item.letterboxdLink,
        item.rottenTomatoesLink,
        item.justWatchLink,
        item.year != null ? String(item.year) : '',
        item.type === 'series' ? 'series tv show television' : '',
        item.type === 'movie' ? 'movie film' : ''
    ];
    const st = String(item.status || '').replace(/-/g, ' ');
    parts.push(st);
    if (item.status === 'want-to-watch') parts.push('want backlog planned queue');
    if (item.status === 'watching') parts.push('current progress now');
    if (item.status === 'watched') parts.push('seen finished done');
    if (item.imdbRating != null && item.imdbRating !== '') parts.push(String(item.imdbRating));
    if (item.rtRating != null && item.rtRating !== '') parts.push(String(item.rtRating));
    if (item.myRating != null && item.myRating !== '') parts.push(String(item.myRating));
    if (item.type === 'series' && Array.isArray(item.episodes)) {
        for (const ep of item.episodes) {
            if (ep && ep.title) parts.push(ep.title);
            const s = ep.season;
            const e = ep.episode;
            if (Number.isFinite(Number(s)) && Number.isFinite(Number(e))) {
                const sn = parseInt(s, 10);
                const en = parseInt(e, 10);
                parts.push(
                    `s${sn}e${en}`,
                    `s${sn} e${en}`,
                    `${sn}x${en}`,
                    `${sn}×${en}`,
                    `season ${sn} episode ${en}`,
                    `season${sn}episode${en}`
                );
            }
        }
    }
    return parts
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function itemMatchesSearch(item, normalizedQuery) {
    if (!normalizedQuery) return true;
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    if (tokens.length === 0) return true;
    const blob = getSearchableBlob(item);
    return tokens.every(t => blob.includes(t));
}

function searchRelevanceScore(item, normalizedQuery) {
    if (!normalizedQuery) return 0;
    const title = String(item.title || '').toLowerCase();
    let score = 0;
    if (title === normalizedQuery) score += 200;
    else if (title.startsWith(normalizedQuery)) score += 120;
    else if (title.includes(normalizedQuery)) score += 75;
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    for (const t of tokens) {
        if (!t) continue;
        if (title === t) score += 55;
        else if (title.startsWith(t)) score += 38;
        else if (title.includes(t)) score += 22;
    }
    const blob = getSearchableBlob(item);
    for (const t of tokens) {
        if (t && blob.includes(t)) score += 4;
    }
    return score;
}

function compareTitleAsc(a, b) {
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, {
        sensitivity: 'base',
        numeric: true
    });
}

function compareGenreAsc(a, b) {
    const ga = String(a.genre || '').trim();
    const gb = String(b.genre || '').trim();
    if (!ga && !gb) return compareTitleAsc(a, b);
    if (!ga) return 1;
    if (!gb) return -1;
    const c = ga.localeCompare(gb, undefined, { sensitivity: 'base', numeric: true });
    if (c !== 0) return c;
    return compareTitleAsc(a, b);
}

function dateAddedTs(item) {
    const t = new Date(item.dateAdded).getTime();
    return Number.isFinite(t) ? t : 0;
}

function parseYear(y) {
    const n = parseInt(y, 10);
    return Number.isFinite(n) ? n : null;
}

function parseImdbRating(r) {
    const n = parseFloat(r);
    return Number.isFinite(n) ? n : null;
}

function statusRank(status) {
    if (status === 'want-to-watch') return 0;
    if (status === 'watching') return 1;
    if (status === 'watched') return 2;
    return 3;
}

function sortWatchlistItems(items) {
    const list = [...items];

    if (searchQuery) {
        list.sort((a, b) => {
            const d = searchRelevanceScore(b, searchQuery) - searchRelevanceScore(a, searchQuery);
            if (d !== 0) return d;
            return compareTitleAsc(a, b);
        });
        return list;
    }

    switch (sortMode) {
        case 'added-asc':
            list.sort((a, b) => dateAddedTs(a) - dateAddedTs(b) || compareTitleAsc(a, b));
            break;
        case 'added-desc':
            list.sort((a, b) => dateAddedTs(b) - dateAddedTs(a) || compareTitleAsc(a, b));
            break;
        case 'title-asc':
            list.sort(compareTitleAsc);
            break;
        case 'title-desc':
            list.sort((a, b) => compareTitleAsc(b, a));
            break;
        case 'year-desc': {
            list.sort((a, b) => {
                const ya = parseYear(a.year);
                const yb = parseYear(b.year);
                if (ya == null && yb == null) return compareTitleAsc(a, b);
                if (ya == null) return 1;
                if (yb == null) return -1;
                if (yb !== ya) return yb - ya;
                return compareTitleAsc(a, b);
            });
            break;
        }
        case 'year-asc': {
            list.sort((a, b) => {
                const ya = parseYear(a.year);
                const yb = parseYear(b.year);
                if (ya == null && yb == null) return compareTitleAsc(a, b);
                if (ya == null) return 1;
                if (yb == null) return -1;
                if (ya !== yb) return ya - yb;
                return compareTitleAsc(a, b);
            });
            break;
        }
        case 'imdb-desc': {
            list.sort((a, b) => {
                const ra = parseImdbRating(a.imdbRating);
                const rb = parseImdbRating(b.imdbRating);
                if (ra == null && rb == null) return compareTitleAsc(a, b);
                if (ra == null) return 1;
                if (rb == null) return -1;
                if (rb !== ra) return rb - ra;
                return compareTitleAsc(a, b);
            });
            break;
        }
        case 'imdb-asc': {
            list.sort((a, b) => {
                const ra = parseImdbRating(a.imdbRating);
                const rb = parseImdbRating(b.imdbRating);
                if (ra == null && rb == null) return compareTitleAsc(a, b);
                if (ra == null) return 1;
                if (rb == null) return -1;
                if (ra !== rb) return ra - rb;
                return compareTitleAsc(a, b);
            });
            break;
        }
        case 'status':
            list.sort((a, b) => {
                const dr = statusRank(a.status) - statusRank(b.status);
                if (dr !== 0) return dr;
                return compareTitleAsc(a, b);
            });
            break;
        default:
            list.sort((a, b) => dateAddedTs(b) - dateAddedTs(a) || compareTitleAsc(a, b));
    }
    return list;
}

function filterAndSortWatchlist() {
    const filtered = watchlist.filter(item => {
        const matchesSearch = itemMatchesSearch(item, searchQuery);

        let matchesFilter = true;
        if (currentFilter === 'movie') matchesFilter = item.type === 'movie';
        else if (currentFilter === 'series') matchesFilter = item.type === 'series';
        else if (currentFilter === 'watched') matchesFilter = item.status === 'watched';
        else if (currentFilter === 'watching') matchesFilter = item.status === 'watching';
        else if (currentFilter === 'want-to-watch') matchesFilter = item.status === 'want-to-watch';

        return matchesSearch && matchesFilter;
    });
    return sortWatchlistItems(filtered);
}

function createCard(item) {
    const statusLabels = {
        'watched': 'Watched',
        'watching': 'Watching',
        'want-to-watch': 'Want to Watch'
    };
    
    const typeIcons = {
        'movie': '🎬',
        'series': '📺'
    };
    
    const links = [];
    if (item.imdbLink) links.push({ url: item.imdbLink, icon: '🎬', title: 'IMDB' });
    if (item.letterboxdLink) links.push({ url: item.letterboxdLink, icon: '🎞️', title: 'Letterboxd' });
    if (item.rottenTomatoesLink) links.push({ url: item.rottenTomatoesLink, icon: '🍅', title: 'Rotten Tomatoes' });
    if (item.justWatchLink) links.push({ url: item.justWatchLink, icon: '📺', title: 'JustWatch' });
    
    return `
        <article class="card" data-id="${item.id}">
            <div class="card-poster">
                ${item.posterUrl 
                    ? `<img src="${item.posterUrl}" alt="${item.title}" onerror="this.parentElement.innerHTML='<span class=\\'card-poster-placeholder\\'>${typeIcons[item.type]}</span>'">`
                    : `<span class="card-poster-placeholder">${typeIcons[item.type]}</span>`
                }
                <span class="card-type-badge">${item.type}</span>
                <span class="card-status-badge ${item.status}">${statusLabels[item.status]}</span>
            </div>
            <div class="card-content">
                <h3 class="card-title">${escapeHtml(item.title)}</h3>
                <div class="card-meta">
                    ${item.year ? `<span class="card-year">${item.year}</span>` : ''}
                    ${item.genre ? `<span class="card-genre">${escapeHtml(item.genre)}</span>` : ''}
                </div>
                ${item.myRating ? `
                    <div class="card-rating">
                        <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        <span>My: ${item.myRating}</span>
                    </div>
                ` : ''}
                ${item.director ? `
                    <div class="card-director"><span class="card-director-label">Director</span>${escapeHtml(item.director)}</div>
                ` : ''}
                ${(item.imdbRating || item.rtRating) ? `
                    <div class="card-ratings">
                        ${item.imdbRating ? `<span class="card-imdb-rating">⭐ IMDB ${item.imdbRating}</span>` : ''}
                        ${item.rtRating ? `<span class="card-rt-rating">🍅 ${item.rtRating}%</span>` : ''}
                    </div>
                ` : ''}
                ${item.notes ? `<p class="card-notes">${escapeHtml(item.notes)}</p>` : ''}
                ${item.type === 'series' ? renderSeriesEpisodesBlock(item) : ''}
                <div class="card-links">
                    ${links.map(link => `
                        <a href="${link.url}" target="_blank" rel="noopener noreferrer" 
                           class="card-link" title="${link.title}">${link.icon}</a>
                    `).join('')}
                    <div class="card-actions">
                        <button class="card-action-btn edit" onclick="editItem('${item.id}')" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="card-action-btn delete" onclick="deleteItem('${item.id}')" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function updateStats() {
    const stats = {
        total: watchlist.length,
        watched: watchlist.filter(i => i.status === 'watched').length,
        watching: watchlist.filter(i => i.status === 'watching').length,
        wantToWatch: watchlist.filter(i => i.status === 'want-to-watch').length
    };
    
    animateNumber(totalCount, stats.total);
    animateNumber(watchedCount, stats.watched);
    animateNumber(watchingCount, stats.watching);
    animateNumber(wantToWatchCount, stats.wantToWatch);
}

function animateNumber(element, target) {
    const current = parseInt(element.textContent) || 0;
    const increment = target > current ? 1 : -1;
    const duration = 300;
    const steps = Math.abs(target - current);
    
    if (steps === 0) return;
    
    const stepTime = duration / steps;
    let value = current;
    
    const timer = setInterval(() => {
        value += increment;
        element.textContent = value;
        if (value === target) clearInterval(timer);
    }, stepTime);
}

// ============================================
// MODAL & FORM
// ============================================

function openModal(id = null) {
    editingId = id;
    const modalTitle = document.getElementById('modalTitle');
    
    if (id) {
        const item = watchlist.find(i => i.id === id);
        if (!item) return;
        
        modalTitle.textContent = 'Edit Title';
        document.getElementById('editId').value = id;
        document.getElementById('title').value = item.title;
        document.getElementById('year').value = item.year || '';
        document.getElementById('type').value = item.type;
        document.getElementById('status').value = item.status;
        document.getElementById('genre').value = item.genre || '';
        const directorEl = document.getElementById('director');
        if (directorEl) directorEl.value = item.director || '';
        document.getElementById('myRating').value = item.myRating || '';
        document.getElementById('imdbRating').value = item.imdbRating || '';
        document.getElementById('rtRating').value = item.rtRating || '';
        document.getElementById('posterUrl').value = item.posterUrl || '';
        document.getElementById('imdbLink').value = item.imdbLink || '';
        document.getElementById('letterboxdLink').value = item.letterboxdLink || '';
        document.getElementById('rottenTomatoesLink').value = item.rottenTomatoesLink || '';
        document.getElementById('justWatchLink').value = item.justWatchLink || '';
        document.getElementById('notes').value = item.notes || '';
        const tmdbTvEl = document.getElementById('tmdbTvIdField');
        if (tmdbTvEl) {
            tmdbTvEl.value =
                item.type === 'series' && item.tmdbTvId != null
                    ? String(item.tmdbTvId)
                    : '';
        }
    } else {
        modalTitle.textContent = 'Add New Title';
        watchlistForm.reset();
        document.getElementById('editId').value = '';
        const tmdbTvEl = document.getElementById('tmdbTvIdField');
        if (tmdbTvEl) tmdbTvEl.value = '';
    }
    
    modalOverlay.classList.add('active');
    updateSeriesFormHint();
    document.getElementById('title').focus();
}

function updateSeriesFormHint() {
    const hint = document.getElementById('seriesEpisodesFormHint');
    const typeEl = document.getElementById('type');
    if (!hint || !typeEl) return;
    hint.hidden = typeEl.value !== 'series';
}

function closeModal() {
    modalOverlay.classList.remove('active');
    editingId = null;
    watchlistForm.reset();
}

function findWatchlistDuplicateIndex(title, year, excludeId = null) {
    const t = String(title || '').trim().toLowerCase();
    const y = year != null && year !== '' ? parseInt(year, 10) : null;
    const yNorm = Number.isFinite(y) ? y : null;
    return watchlist.findIndex(w => {
        if (excludeId != null && w.id === excludeId) return false;
        const wt = String(w.title || '').trim().toLowerCase();
        const wy = w.year != null ? parseInt(w.year, 10) : null;
        const wyNorm = Number.isFinite(wy) ? wy : null;
        return wt === t && wyNorm === yNorm;
    });
}

function mergeEmptyFormFieldsFromPrev(merged, prev, formData) {
    const optional = [
        'notes',
        'genre',
        'director',
        'posterUrl',
        'imdbLink',
        'letterboxdLink',
        'rottenTomatoesLink',
        'justWatchLink',
        'myRating',
        'imdbRating',
        'rtRating'
    ];
    for (const key of optional) {
        const v = formData[key];
        const empty =
            v == null ||
            (typeof v === 'string' && !v.trim()) ||
            (typeof v === 'number' && !Number.isFinite(v));
        if (empty && prev[key] != null && prev[key] !== '') {
            merged[key] = prev[key];
        }
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = {
        title: document.getElementById('title').value.trim(),
        year: parseInt(document.getElementById('year').value) || null,
        type: document.getElementById('type').value,
        status: document.getElementById('status').value,
        genre: document.getElementById('genre').value.trim(),
        myRating: parseFloat(document.getElementById('myRating').value) || null,
        imdbRating: parseFloat(document.getElementById('imdbRating').value) || null,
        rtRating: parseInt(document.getElementById('rtRating').value) || null,
        posterUrl: document.getElementById('posterUrl').value.trim(),
        imdbLink: document.getElementById('imdbLink').value.trim(),
        letterboxdLink: document.getElementById('letterboxdLink').value.trim(),
        rottenTomatoesLink: document.getElementById('rottenTomatoesLink').value.trim(),
        justWatchLink: document.getElementById('justWatchLink').value.trim(),
        notes: document.getElementById('notes').value.trim()
    };

    const tmdbTvIdRaw = document.getElementById('tmdbTvIdField')?.value?.trim() || '';
    const tmdbTvIdParsed = parseInt(tmdbTvIdRaw, 10);
    const tmdbTvId =
        formData.type === 'series' && Number.isFinite(tmdbTvIdParsed) && tmdbTvIdParsed > 0
            ? tmdbTvIdParsed
            : null;
    
    const editId = document.getElementById('editId').value;
    
    if (editId) {
        let index = watchlist.findIndex(i => i.id === editId);
        if (index === -1) {
            index = findWatchlistDuplicateIndex(formData.title, formData.year);
        }
        if (index !== -1) {
            const prev = watchlist[index];
            const keptEpisodes =
                formData.type === 'series' && Array.isArray(prev.episodes) ? prev.episodes : [];
            watchlist[index] = { ...prev, ...formData, id: prev.id, dateAdded: prev.dateAdded };
            if (formData.type === 'series') {
                watchlist[index].episodes = keptEpisodes;
                if (tmdbTvId != null) watchlist[index].tmdbTvId = tmdbTvId;
                else delete watchlist[index].tmdbTvId;
            } else {
                delete watchlist[index].episodes;
            }
            normalizeItemEpisodes(watchlist[index]);
            showToast('Title updated successfully!', 'success');
        }
    } else {
        const dupIdx = findWatchlistDuplicateIndex(formData.title, formData.year);
        if (dupIdx !== -1) {
            const prev = watchlist[dupIdx];
            const keptEpisodes =
                formData.type === 'series' && Array.isArray(prev.episodes) ? prev.episodes : [];
            const merged = { ...prev, ...formData, id: prev.id, dateAdded: prev.dateAdded };
            mergeEmptyFormFieldsFromPrev(merged, prev, formData);
            watchlist[dupIdx] = merged;
            if (formData.type === 'series') {
                watchlist[dupIdx].episodes = keptEpisodes;
                if (tmdbTvId != null) watchlist[dupIdx].tmdbTvId = tmdbTvId;
                else delete watchlist[dupIdx].tmdbTvId;
            } else {
                delete watchlist[dupIdx].episodes;
            }
            normalizeItemEpisodes(watchlist[dupIdx]);
            showToast('Updated existing title (same name & year) instead of adding a duplicate.', 'success');
        } else {
            const newItem = {
                id: generateId(),
                ...formData,
                dateAdded: new Date().toISOString()
            };
            if (formData.type === 'series') {
                newItem.episodes = [];
                if (tmdbTvId != null) newItem.tmdbTvId = tmdbTvId;
            }
            watchlist.unshift(newItem);
            normalizeItemEpisodes(newItem);
            showToast('Title added to your watchlist!', 'success');
        }
    }
    
    saveWatchlist();
    renderWatchlist();
    updateStats();
    closeModal();
}

// ============================================
// CRUD OPERATIONS
// ============================================

function editItem(id) {
    openModal(id);
}

function deleteItem(id) {
    const item = watchlist.find(i => i.id === id);
    if (!item) return;
    
    if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
        watchlist = watchlist.filter(i => i.id !== id);
        saveWatchlist();
        renderWatchlist();
        updateStats();
        showToast('Title removed from watchlist', 'success');
    }
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type} visible`;
    
    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

// ============================================
// IMPORT FUNCTIONALITY
// ============================================

function openImportModal() {
    importModalOverlay.classList.add('active');
    resetImportState(true);
}

function closeImportModal() {
    importModalOverlay.classList.remove('active');
    resetImportState(true);
}

/** @param {boolean} full - true: modal open/close — reset tab & paste box. false: cancel from preview — keep tab & pasted text. */
function resetImportState(full) {
    pendingImports = [];
    importFile.value = '';
    importPreview.style.display = 'none';

    const pastePanel = document.getElementById('importPastePanel');

    if (full) {
        currentImportSource = 'letterboxd';
        importTabs.forEach(t => t.classList.toggle('active', t.dataset.source === 'letterboxd'));
        instructionPanels.forEach(p => p.classList.toggle('active', p.dataset.source === 'letterboxd'));
        const ta = document.getElementById('pasteTitlesInput');
        if (ta) ta.value = '';
        importDropzone.style.display = 'block';
        if (pastePanel) pastePanel.style.display = 'none';
    } else {
        const isPaste = currentImportSource === 'paste';
        importDropzone.style.display = isPaste ? 'none' : 'block';
        if (pastePanel) pastePanel.style.display = isPaste ? 'block' : 'none';
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const csv = e.target.result;
        const data = parseCSV(csv);
        
        if (data.length === 0) {
            showToast('No valid data found in the file', 'error');
            return;
        }
        
        pendingImports = transformData(data, currentImportSource);
        showPreview();
    };
    reader.readAsText(file);
}

function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx].trim();
            });
            data.push(row);
        }
    }
    
    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    
    return result;
}

function transformData(data, source) {
    switch (source) {
        case 'letterboxd':
            return transformLetterboxd(data);
        case 'imdb':
            return transformIMDB(data);
        default:
            return transformCustomCSV(data);
    }
}

function transformLetterboxd(data) {
    // Detect file type based on columns present
    const sampleRow = data[0] || {};
    const columns = Object.keys(sampleRow).map(k => k.toLowerCase());
    
    // Determine default status based on CSV type
    let defaultStatus = 'watched';
    if (columns.includes('watched date') || columns.includes('diary')) {
        defaultStatus = 'watched'; // diary.csv
    } else if (columns.includes('rating') && !columns.includes('watched date')) {
        defaultStatus = 'watched'; // ratings.csv - you rated it, so you watched it
    } else if (!columns.includes('rating') && !columns.includes('watched date')) {
        defaultStatus = 'want-to-watch'; // watchlist.csv - no rating or watch date
    }
    
    // Store detected status for UI hint
    detectedImportStatus = defaultStatus;
    
    return data.map(row => {
        const title = row.name || row.title || row.film || '';
        const year = parseInt(row.year) || null;
        const rating = row.rating ? parseFloat(row.rating) * 2 : null; // Letterboxd uses 0-5, we use 0-10
        const letterboxdUri = row['letterboxd uri'] || row.uri || '';
        const watchedDate = row['watched date'] || row.date || '';
        const contentKind = (
            row['object type'] ||
            row.objecttype ||
            row['media type'] ||
            row.type ||
            ''
        )
            .toString()
            .toLowerCase();
        let lbType = 'movie';
        if (contentKind.includes('tv') || contentKind.includes('series') || contentKind.includes('episode')) {
            lbType = 'series';
        }

        return {
            id: generateId(),
            title: title,
            year: year,
            type: lbType,
            status: defaultStatus, // Will be overridden by user selection if not auto
            genre: '',
            director: '',
            myRating: rating,
            posterUrl: '',
            imdbLink: '',
            letterboxdLink: letterboxdUri ? `https://letterboxd.com${letterboxdUri}` : '',
            rottenTomatoesLink: '',
            justWatchLink: '',
            notes: watchedDate ? `Watched: ${watchedDate}` : '',
            dateAdded: new Date().toISOString(),
            ...(lbType === 'series' ? { episodes: [] } : {})
        };
    }).filter(item => item.title);
}

function transformIMDB(data) {
    // Detect if this is a watchlist or ratings export
    const sampleRow = data[0] || {};
    const columns = Object.keys(sampleRow).map(k => k.toLowerCase());
    
    // If there's no "your rating" column or all ratings are empty, likely a watchlist
    const hasRatings = data.some(row => row['your rating'] && row['your rating'] !== '');
    let defaultStatus = hasRatings ? 'watched' : 'want-to-watch';
    
    detectedImportStatus = defaultStatus;
    
    return data.map(row => {
        const title = row.title || row.name || '';
        const year = parseInt(row.year) || null;
        const imdbId = row.const || row.imdbid || row['imdb id'] || '';
        const yourRating = parseFloat(row['your rating']) || null;
        const titleType = (row['title type'] || '').toLowerCase();
        const genres = row.genres || row.genre || '';
        
        // Determine type
        let type = 'movie';
        if (titleType.includes('series') || titleType.includes('tv')) {
            type = 'series';
        }
        
        // Individual item status - if no rating, probably watchlist
        let status = yourRating ? 'watched' : defaultStatus;
        
        return {
            id: generateId(),
            title: title,
            year: year,
            type: type,
            status: status,
            genre: genres,
            director: '',
            myRating: yourRating,
            posterUrl: '',
            imdbLink: imdbId ? `https://www.imdb.com/title/${imdbId}/` : '',
            letterboxdLink: '',
            rottenTomatoesLink: '',
            justWatchLink: '',
            notes: '',
            dateAdded: new Date().toISOString(),
            ...(type === 'series' ? { episodes: [] } : {})
        };
    }).filter(item => item.title);
}

function transformCustomCSV(data) {
    // Check if status column exists
    const sampleRow = data[0] || {};
    const hasStatus = sampleRow.status !== undefined;
    
    detectedImportStatus = hasStatus ? 'auto' : 'want-to-watch';
    
    return data.map(row => {
        const title = row.title || row.name || row.film || row.movie || '';
        const year = parseInt(row.year || row.release_year) || null;
        const type = (row.type || 'movie').toLowerCase().includes('series') ? 'series' : 'movie';
        const status = row.status ? normalizeStatus(row.status) : 'want-to-watch';
        const rating = parseFloat(row.rating || row.my_rating || row.score) || null;
        const genre = row.genre || row.genres || '';
        const director = row.director || row.directors || '';
        const imdbRatingRaw = row.imdb_rating != null ? String(row.imdb_rating).trim() : '';
        const imdbRatingParsed =
            imdbRatingRaw && imdbRatingRaw !== 'N/A' ? parseFloat(imdbRatingRaw) : NaN;
        const rtRaw = row.rt_rating != null ? String(row.rt_rating).trim() : '';
        const rtParsed = rtRaw ? parseInt(rtRaw.replace(/%/g, ''), 10) : NaN;

        return {
            id: generateId(),
            title: title,
            year: year,
            type: type,
            status: status,
            genre: genre,
            director: director,
            myRating: rating > 10 ? rating / 10 : rating, // Normalize if 0-100 scale
            posterUrl: row.poster || row.poster_url || row.image || '',
            imdbLink: row.imdb || row.imdb_link || row.imdb_url || '',
            letterboxdLink: row.letterboxd || row.letterboxd_link || '',
            rottenTomatoesLink: row.rotten_tomatoes || row.rt_link || '',
            justWatchLink: row.justwatch || row.justwatch_link || '',
            notes: row.notes || row.comments || row.review || '',
            imdbRating: Number.isFinite(imdbRatingParsed) ? imdbRatingParsed : null,
            rtRating: Number.isFinite(rtParsed) ? rtParsed : null,
            dateAdded: new Date().toISOString(),
            ...(type === 'series' ? { episodes: [] } : {})
        };
    }).filter(item => item.title);
}

function normalizeStatus(status) {
    if (!status) return 'watched';
    const s = status.toLowerCase();
    if (s.includes('want') || s.includes('plan') || s.includes('backlog')) return 'want-to-watch';
    if (s.includes('watching') || s.includes('progress') || s.includes('current')) return 'watching';
    return 'watched';
}

function stripLeadingBullet(line) {
    return line
        .replace(/^[\s\uFEFF]+/, '')
        .replace(/^[\-\*\u2022\u00B7]\s+/, '')
        .replace(/^\d+[\.\)]\s+/, '')
        .trim();
}

function parseTitleAndYearFromPaste(rawLine) {
    const line = stripLeadingBullet(rawLine);
    if (!line) return null;

    let title = line;
    let year = null;

    const parenYear = line.match(/^(.*?)\s*\((\d{4})(?:\s*[\u2013\u2014\-–]\s*\d{4})?\)\s*$/);
    if (parenYear) {
        title = parenYear[1].trim();
        year = parseInt(parenYear[2], 10);
    } else {
        const dashYear = line.match(/^(.*?)\s+[\u2014\u2013\-–]\s*(\d{4})\s*$/);
        if (dashYear && dashYear[1].trim().length >= 1) {
            title = dashYear[1].trim();
            year = parseInt(dashYear[2], 10);
        }
    }

    if (title.length < 1) return null;
    return { title, year, raw: rawLine };
}

function guessTypeFromPasteLine(line) {
    const s = line.toLowerCase();
    if (/\b(tv series|miniseries|limited series|anthology series|television series)\b/.test(s)) return 'series';
    if (/\(\s*tv(\s+series|\s+show)?\s*\)/.test(s)) return 'series';
    if (/\b(s\d{1,2}\s*e\d{1,2}|season\s*\d+)\b/.test(s)) return 'series';
    if (/\b(k-drama|kdrama|anime|soap opera|sitcom)\b/.test(s)) return 'series';
    return 'movie';
}

function splitPasteIntoSegments(text) {
    const segments = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s*[|;]\s*/).map(p => p.trim()).filter(Boolean);
        for (const p of parts) segments.push(p);
    }
    return segments;
}

function titlesFromPasteText(text) {
    const segments = splitPasteIntoSegments(text);
    const items = [];
    for (const seg of segments) {
        const parsed = parseTitleAndYearFromPaste(seg);
        if (!parsed) continue;
        const pstType = guessTypeFromPasteLine(seg);
        items.push({
            id: generateId(),
            title: parsed.title,
            year: parsed.year,
            type: pstType,
            status: 'want-to-watch',
            genre: '',
            director: '',
            myRating: null,
            posterUrl: '',
            imdbLink: '',
            letterboxdLink: '',
            rottenTomatoesLink: '',
            justWatchLink: '',
            notes: '',
            dateAdded: new Date().toISOString(),
            ...(pstType === 'series' ? { episodes: [] } : {})
        });
    }
    return items;
}

function handlePasteTitlesPreview() {
    const ta = document.getElementById('pasteTitlesInput');
    const raw = ta?.value || '';
    pendingImports = titlesFromPasteText(raw);
    if (pendingImports.length === 0) {
        showToast('No titles found — one per line, or split with | or ;', 'error');
        return;
    }
    detectedImportStatus = 'want-to-watch';
    showPreview();
}

function showPreview() {
    if (pendingImports.length === 0) {
        showToast('No valid entries found to import', 'error');
        return;
    }
    
    importDropzone.style.display = 'none';
    const pastePanel = document.getElementById('importPastePanel');
    if (pastePanel) pastePanel.style.display = 'none';
    importPreview.style.display = 'block';

    document.getElementById('previewCount').textContent = `(${pendingImports.length} items)`;
    document.getElementById('importCountBtn').textContent = pendingImports.length;

    const importStatusSelect = document.getElementById('importStatus');
    const autoOption = importStatusSelect.querySelector('option[value="auto"]');
    const statusLabels = {
        'watched': 'Watched',
        'watching': 'Watching',
        'want-to-watch': 'Want to Watch'
    };

    if (currentImportSource === 'paste') {
        importStatusSelect.value = 'want-to-watch';
    } else {
        importStatusSelect.value = 'auto';
    }
    autoOption.textContent = `Auto-detect (${statusLabels[detectedImportStatus]})`;
    
    // Build preview table
    const thead = previewTable.querySelector('thead');
    const tbody = previewTable.querySelector('tbody');
    
    thead.innerHTML = '<tr><th>Title</th><th>Year</th><th>Type</th><th>Rating</th><th>Status</th></tr>';
    tbody.innerHTML = pendingImports.slice(0, 50).map(item => `
        <tr>
            <td>${escapeHtml(item.title)}</td>
            <td>${item.year || '-'}</td>
            <td>${item.type}</td>
            <td>${item.myRating || '-'}</td>
            <td>${statusLabels[item.status] || item.status}</td>
        </tr>
    `).join('');
    
    if (pendingImports.length > 50) {
        tbody.innerHTML += `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">... and ${pendingImports.length - 50} more</td></tr>`;
    }
}

async function executeImport() {
    await checkServerConfig();

    const skipDuplicates = document.getElementById('skipDuplicates').checked;
    const importStatus = document.getElementById('importStatus').value;

    let imported = 0;
    let skipped = 0;
    const newIds = new Set();

    pendingImports.forEach(item => {
        // Check for duplicates
        if (skipDuplicates) {
            const exists = watchlist.some(w =>
                w.title.toLowerCase() === item.title.toLowerCase() &&
                w.year === item.year
            );
            if (exists) {
                skipped++;
                return;
            }
        }

        // Override status if not auto-detect
        if (importStatus !== 'auto') {
            item.status = importStatus;
        }

        watchlist.push(item);
        newIds.add(item.id);
        imported++;
    });

    normalizeWatchlistEpisodes();
    saveWatchlist();
    renderWatchlist();
    updateStats();
    closeImportModal();

    let message = `Successfully imported ${imported} titles!`;
    if (skipped > 0) {
        message += ` (${skipped} duplicates skipped)`;
    }

    const canEnrich =
        imported > 0 &&
        (serverHasTmdbKey || serverHasOmdbKey || tmdbApiKey || omdbApiKey);
    if (imported > 0 && !canEnrich) {
        message +=
            ' To auto-fill posters & ratings, set TMDB_API_KEY / OMDB_API_KEY on the server (Vercel env) or add keys in Settings.';
    }
    showToast(message, 'success');

    if (canEnrich) {
        await bulkFetchDetails({ onlyIds: newIds, manageUi: false, quietEmpty: true });
    }
}

// ============================================
// SETTINGS & API
// ============================================

function loadApiKey() {
    omdbApiKey = localStorage.getItem(OMDB_API_KEY_STORAGE) || '';
    tmdbApiKey = localStorage.getItem(TMDB_API_KEY_STORAGE) || '';
    if (omdbApiKeyInput) {
        omdbApiKeyInput.value = omdbApiKey;
    }
    const tmdbInput = document.getElementById('tmdbApiKey');
    if (tmdbInput) {
        tmdbInput.value = tmdbApiKey;
    }
}

async function openSettingsModal() {
    settingsModalOverlay.classList.add('active');
    await checkServerConfig();
    loadApiKey();
    omdbApiKeyInput.value = omdbApiKey;
    document.getElementById('tmdbApiKey').value = tmdbApiKey;
    updateApiKeyStatus();
}

function closeSettingsModal() {
    settingsModalOverlay.classList.remove('active');
}

function updateApiKeyStatus() {
    const banner = document.getElementById('serverKeysBanner');
    const serverProvides = serverHasOmdbKey || serverHasTmdbKey;
    if (banner) {
        banner.style.display = serverProvides ? 'block' : 'none';
    }

    // OMDB: prefer server message when env is configured (no local key needed)
    if (serverHasOmdbKey && !omdbApiKey) {
        apiKeyStatus.textContent = '✓ Provided by server — nothing to paste here';
        apiKeyStatus.className = 'api-key-status success';
    } else if (omdbApiKey) {
        apiKeyStatus.textContent = '✓ Browser key saved (overrides server for this device)';
        apiKeyStatus.className = 'api-key-status success';
    } else {
        apiKeyStatus.textContent = '⚠ No key — add below, or deploy with OMDB_API_KEY on the server';
        apiKeyStatus.className = 'api-key-status error';
    }

    const tmdbStatus = document.getElementById('tmdbApiKeyStatus');
    if (serverHasTmdbKey && !tmdbApiKey) {
        tmdbStatus.textContent = '✓ Provided by server — nothing to paste here';
        tmdbStatus.className = 'api-key-status success';
    } else if (tmdbApiKey) {
        tmdbStatus.textContent = '✓ Browser key saved (overrides server for this device)';
        tmdbStatus.className = 'api-key-status success';
    } else {
        tmdbStatus.textContent = '⚠ No key — add below, or deploy with TMDB_API_KEY on the server';
        tmdbStatus.className = 'api-key-status error';
    }
}

async function saveApiKey() {
    const key = omdbApiKeyInput.value.trim();
    
    if (!key) {
        omdbApiKey = '';
        localStorage.removeItem(OMDB_API_KEY_STORAGE);
        updateApiKeyStatus();
        showToast('OMDB API key removed', 'success');
        return;
    }
    
    // Test the API key
    apiKeyStatus.textContent = 'Testing API key...';
    apiKeyStatus.className = 'api-key-status';
    
    try {
        const response = await fetch(`${OMDB_BASE_URL}?apikey=${key}&t=Inception`);
        const data = await response.json();
        
        if (data.Response === 'True') {
            omdbApiKey = key;
            localStorage.setItem(OMDB_API_KEY_STORAGE, key);
            apiKeyStatus.textContent = '✓ API key verified and saved!';
            apiKeyStatus.className = 'api-key-status success';
            showToast('OMDB API key saved!', 'success');
        } else if (data.Error === 'Invalid API key!') {
            apiKeyStatus.textContent = '✗ Invalid API key';
            apiKeyStatus.className = 'api-key-status error';
            showToast('Invalid API key', 'error');
        } else {
            throw new Error(data.Error);
        }
    } catch (error) {
        apiKeyStatus.textContent = '✗ Could not verify API key';
        apiKeyStatus.className = 'api-key-status error';
        showToast('Error testing API key', 'error');
    }
}

async function saveTmdbApiKey() {
    const key = document.getElementById('tmdbApiKey').value.trim();
    const tmdbStatus = document.getElementById('tmdbApiKeyStatus');
    
    if (!key) {
        tmdbApiKey = '';
        localStorage.removeItem(TMDB_API_KEY_STORAGE);
        updateApiKeyStatus();
        showToast('TMDB API key removed', 'success');
        return;
    }
    
    // Test the API key
    tmdbStatus.textContent = 'Testing API key...';
    tmdbStatus.className = 'api-key-status';
    
    try {
        const response = await fetch(`${TMDB_BASE_URL}/movie/550?api_key=${key}`);
        const data = await response.json();
        
        if (data.id) {
            tmdbApiKey = key;
            localStorage.setItem(TMDB_API_KEY_STORAGE, key);
            tmdbStatus.textContent = '✓ API key verified and saved!';
            tmdbStatus.className = 'api-key-status success';
            showToast('TMDB API key saved!', 'success');
        } else if (data.status_code === 7) {
            tmdbStatus.textContent = '✗ Invalid API key';
            tmdbStatus.className = 'api-key-status error';
            showToast('Invalid TMDB API key', 'error');
        } else {
            throw new Error(data.status_message);
        }
    } catch (error) {
        tmdbStatus.textContent = '✗ Could not verify API key';
        tmdbStatus.className = 'api-key-status error';
        showToast('Error testing TMDB API key', 'error');
    }
}

function exportData() {
    const data = JSON.stringify(watchlist, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = listMode === 'shared' ? 'together' : getActiveProfileSlug();
    a.download = `watchlist-backup-${slug}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON exported — use Import backup to restore the full list.', 'success');
}

function escapeCsvCell(val) {
    if (val == null) return '';
    const s = String(val);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function exportWatchlistCsv() {
    const headers = [
        'title',
        'year',
        'type',
        'status',
        'rating',
        'genre',
        'director',
        'imdb_link',
        'poster_url',
        'letterboxd_link',
        'rotten_tomatoes_link',
        'justwatch_link',
        'notes',
        'imdb_rating',
        'rt_rating'
    ];
    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const item of watchlist) {
        lines.push(
            [
                item.title,
                item.year ?? '',
                item.type ?? '',
                item.status ?? '',
                item.myRating ?? '',
                item.genre ?? '',
                item.director ?? '',
                item.imdbLink ?? '',
                item.posterUrl ?? '',
                item.letterboxdLink ?? '',
                item.rottenTomatoesLink ?? '',
                item.justWatchLink ?? '',
                item.notes ?? '',
                item.imdbRating ?? '',
                item.rtRating ?? ''
            ]
                .map(escapeCsvCell)
                .join(',')
        );
    }
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = listMode === 'shared' ? 'together' : getActiveProfileSlug();
    a.download = `watchlist-${slug}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported — open in Excel/Sheets or re-import via Import → Custom CSV.', 'success');
}

function importBackupFromJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            const items = Array.isArray(parsed) ? parsed : parsed?.items;
            if (!Array.isArray(items)) {
                showToast('File must be a JSON array of movies (or { items: [...] })', 'error');
                return;
            }
            const valid = items.filter((it) => it && typeof it.title === 'string' && it.title.trim());
            if (!valid.length) {
                showToast('No titles found in file', 'error');
                return;
            }
            const merged = valid.map((it) => {
                const typ = it.type === 'series' ? 'series' : 'movie';
                const row = {
                    id: it.id || generateId(),
                    title: it.title.trim(),
                    year: it.year != null ? parseInt(it.year, 10) || null : null,
                    type: typ,
                    status: it.status || 'want-to-watch',
                    genre: it.genre || '',
                    director: it.director || '',
                    myRating: it.myRating != null ? parseFloat(it.myRating) : null,
                    imdbRating: it.imdbRating != null ? parseFloat(it.imdbRating) : null,
                    rtRating: it.rtRating != null ? parseInt(it.rtRating, 10) : null,
                    posterUrl: it.posterUrl || '',
                    imdbLink: it.imdbLink || '',
                    letterboxdLink: it.letterboxdLink || '',
                    rottenTomatoesLink: it.rottenTomatoesLink || '',
                    justWatchLink: it.justWatchLink || '',
                    notes: it.notes || '',
                    dateAdded: it.dateAdded || new Date().toISOString()
                };
                if (typ === 'series') {
                    row.episodes = Array.isArray(it.episodes)
                        ? it.episodes
                              .filter(
                                  (ep) =>
                                      ep &&
                                      Number.isFinite(Number(ep.season)) &&
                                      Number.isFinite(Number(ep.episode))
                              )
                              .map((ep) => ({
                                  season: Math.max(1, parseInt(ep.season, 10)),
                                  episode: Math.max(1, parseInt(ep.episode, 10)),
                                  title: typeof ep.title === 'string' ? ep.title : '',
                                  watched: !!ep.watched
                              }))
                        : [];
                    if (it.tmdbTvId != null) {
                        const tid = parseInt(it.tmdbTvId, 10);
                        if (Number.isFinite(tid) && tid > 0) row.tmdbTvId = tid;
                    }
                    if (
                        it.tmdbSeason1Guide &&
                        typeof it.tmdbSeason1Guide === 'object' &&
                        Array.isArray(it.tmdbSeason1Guide.episodes)
                    ) {
                        const gTv =
                            it.tmdbSeason1Guide.tmdbTvId != null
                                ? parseInt(it.tmdbSeason1Guide.tmdbTvId, 10)
                                : NaN;
                        row.tmdbSeason1Guide = {
                            fetchedAt:
                                typeof it.tmdbSeason1Guide.fetchedAt === 'string'
                                    ? it.tmdbSeason1Guide.fetchedAt
                                    : new Date().toISOString(),
                            tmdbTvId: Number.isFinite(gTv)
                                ? gTv
                                : row.tmdbTvId != null
                                  ? row.tmdbTvId
                                  : null,
                            episodes: it.tmdbSeason1Guide.episodes
                        };
                    }
                    if (it.tmdbSeasonGuides && typeof it.tmdbSeasonGuides === 'object') {
                        try {
                            row.tmdbSeasonGuides = JSON.parse(JSON.stringify(it.tmdbSeasonGuides));
                        } catch (e) {
                            /* skip corrupt */
                        }
                    }
                    if (it.tmdbTvShowMeta && typeof it.tmdbTvShowMeta === 'object') {
                        row.tmdbTvShowMeta = {
                            fetchedAt:
                                typeof it.tmdbTvShowMeta.fetchedAt === 'string'
                                    ? it.tmdbTvShowMeta.fetchedAt
                                    : new Date().toISOString(),
                            tmdbTvId:
                                it.tmdbTvShowMeta.tmdbTvId != null
                                    ? parseInt(it.tmdbTvShowMeta.tmdbTvId, 10) || row.tmdbTvId
                                    : row.tmdbTvId,
                            numberOfSeasons:
                                it.tmdbTvShowMeta.numberOfSeasons != null
                                    ? parseInt(it.tmdbTvShowMeta.numberOfSeasons, 10)
                                    : null
                        };
                        if (
                            row.tmdbTvShowMeta.numberOfSeasons == null ||
                            !Number.isFinite(row.tmdbTvShowMeta.numberOfSeasons)
                        ) {
                            delete row.tmdbTvShowMeta;
                        }
                    }
                }
                return row;
            });

            const merge = confirm(
                `Import ${merged.length} titles and MERGE with what you have? OK = merge, Cancel = replace entire list`
            );
            if (merge) {
                let added = 0;
                for (const it of merged) {
                    const dup = watchlist.some(
                        (w) =>
                            w.title.toLowerCase() === it.title.toLowerCase() &&
                            (w.year || null) === (it.year || null)
                    );
                    if (!dup) {
                        watchlist.push(it);
                        added++;
                    }
                }
                showToast(`Merged: ${added} new titles (${merged.length - added} duplicates skipped)`, 'success');
            } else {
                watchlist = merged;
                showToast(`Replaced list with ${merged.length} titles`, 'success');
            }
            normalizeWatchlistEpisodes();
            saveWatchlist();
            if (hasCloudSync) pushWatchlistToCloud();
            renderWatchlist();
            updateStats();
            void hydrateTmdbSeasonGuides();
            closeSettingsModal();
        } catch (err) {
            showToast('Invalid JSON file', 'error');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    const which =
        listMode === 'shared'
            ? 'the shared “Watch together” list for EVERYONE'
            : 'your personal watchlist';
    if (confirm(`Delete ALL titles in ${which}? This cannot be undone.`)) {
        if (confirm('Really delete everything?')) {
            watchlist = [];
            saveWatchlist();
            renderWatchlist();
            updateStats();
            closeSettingsModal();
            showToast('List cleared', 'success');
        }
    }
}

// ============================================
// TMDB API INTEGRATION
// ============================================

async function searchTMDB(title, year = null) {
    // Use server API if available, otherwise use client-side key
    if (serverHasTmdbKey) {
        let url = `/api/tmdb/search?query=${encodeURIComponent(title)}`;
        if (year) url += `&year=${year}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                return data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
            }
            return [];
        } catch (error) {
            console.error('TMDB search error:', error);
            return [];
        }
    }
    
    if (!tmdbApiKey) return null;
    
    let url = `${TMDB_BASE_URL}/search/multi?api_key=${tmdbApiKey}&query=${encodeURIComponent(title)}`;
    if (year) url += `&year=${year}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            return data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
        }
        return [];
    } catch (error) {
        console.error('TMDB search error:', error);
        return [];
    }
}

function isTmdbDetailsPayload(data) {
    return (
        data &&
        typeof data === 'object' &&
        !data.status_code &&
        (data.id != null || data.title || data.name)
    );
}

function directorsFromTmdbCrew(tmdbDetails) {
    if (!tmdbDetails?.credits?.crew) return '';
    return tmdbDetails.credits.crew
        .filter(c => c.job === 'Director')
        .map(c => c.name)
        .join(', ');
}

async function getTMDBDetails(id, mediaType) {
    // Use server API if available
    if (serverHasTmdbKey) {
        try {
            const response = await fetch(`/api/tmdb/${mediaType}/${id}`);
            const data = await response.json();
            if (!response.ok || !isTmdbDetailsPayload(data)) return null;
            return data;
        } catch (error) {
            console.error('TMDB details error:', error);
            return null;
        }
    }
    
    if (!tmdbApiKey) return null;
    
    try {
        const response = await fetch(`${TMDB_BASE_URL}/${mediaType}/${id}?api_key=${tmdbApiKey}&append_to_response=external_ids,credits`);
        const data = await response.json();
        if (!response.ok || !isTmdbDetailsPayload(data)) return null;
        return data;
    } catch (error) {
        console.error('TMDB details error:', error);
        return null;
    }
}

function getTMDBPosterUrl(posterPath, size = 'w500') {
    if (!posterPath) return '';
    return `${TMDB_IMAGE_BASE}${size}${posterPath}`;
}

async function fetchTMDBTvSeason(tvId, seasonNumber) {
    const id = parseInt(tvId, 10);
    const sn = parseInt(seasonNumber, 10);
    if (!Number.isFinite(id) || id < 1 || !Number.isFinite(sn) || sn < 1) return null;

    if (serverHasTmdbKey) {
        try {
            const response = await fetch(`/api/tmdb/tv/${id}/season/${sn}`);
            if (!response.ok) return null;
            return response.json();
        } catch (e) {
            console.warn('TMDB season fetch', e);
            return null;
        }
    }

    if (!tmdbApiKey) return null;
    try {
        const response = await fetch(
            `${TMDB_BASE_URL}/tv/${id}/season/${sn}?api_key=${tmdbApiKey}`
        );
        if (!response.ok) return null;
        return response.json();
    } catch (e) {
        console.warn('TMDB season fetch', e);
        return null;
    }
}

function seasonGuideIsCached(item, seasonNum) {
    const g = item.tmdbSeasonGuides?.[String(seasonNum)];
    return !!(g && g.fetchedAt && Array.isArray(g.episodes));
}

function seriesNeedsTmdbSeasonHydration(item) {
    if (item.type !== 'series' || item.tmdbTvId == null || !Number.isFinite(Number(item.tmdbTvId))) {
        return false;
    }
    if (!item.tmdbTvShowMeta?.numberOfSeasons) return true;
    const n = Math.min(item.tmdbTvShowMeta.numberOfSeasons, TMDB_MAX_SEASONS_PER_SHOW);
    for (let s = 1; s <= n; s++) {
        if (!seasonGuideIsCached(item, s)) return true;
    }
    return false;
}

function mergeSeasonGuideIntoItem(item, tvId, seasonNum, data) {
    const snRaw = data.season_number != null ? parseInt(data.season_number, 10) : seasonNum;
    const sn = Number.isFinite(snRaw) && snRaw >= 1 ? snRaw : seasonNum;
    const eps = Array.isArray(data.episodes) ? data.episodes : [];
    const slim = eps
        .map(ep => ({
            episode_number: parseInt(ep.episode_number, 10),
            name: typeof ep.name === 'string' ? ep.name : '',
            air_date: typeof ep.air_date === 'string' ? ep.air_date : '',
            runtime: ep.runtime != null ? ep.runtime : null
        }))
        .filter(ep => Number.isFinite(ep.episode_number) && ep.episode_number >= 1);

    if (!item.tmdbSeasonGuides || typeof item.tmdbSeasonGuides !== 'object') {
        item.tmdbSeasonGuides = {};
    }
    item.tmdbSeasonGuides[String(sn)] = {
        fetchedAt: new Date().toISOString(),
        tmdbTvId: tvId,
        seasonNumber: sn,
        episodes: slim
    };

    if (!Array.isArray(item.episodes)) item.episodes = [];
    const existing = new Set(item.episodes.map(e => `${e.season}-${e.episode}`));
    for (const ep of slim) {
        const key = `${sn}-${ep.episode_number}`;
        if (!existing.has(key)) {
            item.episodes.push({
                season: sn,
                episode: ep.episode_number,
                title: ep.name || '',
                watched: false
            });
            existing.add(key);
        }
    }
    return true;
}

async function ensureTmdbSeasonGuidesForItem(item, budget) {
    if (item.type !== 'series') return false;
    const tvId = Number(item.tmdbTvId);
    if (!Number.isFinite(tvId) || tvId < 1) return false;

    let changed = false;
    const delay = () => new Promise(r => setTimeout(r, TMDB_SEASON_HYDRATE_DELAY_MS));

    if (!item.tmdbTvShowMeta?.numberOfSeasons) {
        if (budget.fetchCount >= budget.maxFetches) return false;
        const show = await getTMDBDetails(tvId, 'tv');
        budget.fetchCount++;
        await delay();
        if (show?.number_of_seasons != null) {
            const nos = parseInt(show.number_of_seasons, 10);
            if (Number.isFinite(nos) && nos >= 1) {
                item.tmdbTvShowMeta = {
                    fetchedAt: new Date().toISOString(),
                    tmdbTvId: tvId,
                    numberOfSeasons: nos
                };
                changed = true;
            }
        }
        if (!item.tmdbTvShowMeta?.numberOfSeasons) {
            item.tmdbTvShowMeta = {
                fetchedAt: new Date().toISOString(),
                tmdbTvId: tvId,
                numberOfSeasons: 1
            };
            changed = true;
        }
    }

    const n = Math.min(item.tmdbTvShowMeta.numberOfSeasons, TMDB_MAX_SEASONS_PER_SHOW);
    for (let s = 1; s <= n; s++) {
        if (budget.fetchCount >= budget.maxFetches) break;
        if (seasonGuideIsCached(item, s)) continue;
        const data = await fetchTMDBTvSeason(tvId, s);
        budget.fetchCount++;
        if (data && Array.isArray(data.episodes)) {
            mergeSeasonGuideIntoItem(item, tvId, s, data);
            changed = true;
        }
        await delay();
    }
    return changed;
}

async function searchTMDBTv(title, year = null) {
    const q = typeof title === 'string' ? title.trim() : '';
    if (!q) return [];

    if (serverHasTmdbKey) {
        try {
            let url = `/api/tmdb/search/tv?query=${encodeURIComponent(q)}`;
            if (year != null && year !== '') {
                const y = parseInt(year, 10);
                if (Number.isFinite(y)) url += `&year=${y}`;
            }
            const response = await fetch(url);
            const data = await response.json();
            if (data.results && Array.isArray(data.results)) return data.results;
            return [];
        } catch (e) {
            console.error('TMDB TV search error:', e);
            return [];
        }
    }

    if (!tmdbApiKey) return [];
    let url = `${TMDB_BASE_URL}/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(q)}`;
    if (year != null && year !== '') {
        const y = parseInt(year, 10);
        if (Number.isFinite(y) && y >= 1900 && y <= 2100) {
            url += `&first_air_date_year=${y}`;
        }
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.results && Array.isArray(data.results)) return data.results;
        return [];
    } catch (e) {
        console.error('TMDB TV search error:', e);
        return [];
    }
}

async function resolveTmdbTvIdForSeries(item) {
    const results = await searchTMDBTv(item.title, item.year);
    const first = results[0];
    return first && first.id ? first.id : null;
}

async function hydrateTmdbSeasonGuides() {
    if (tmdbSeasonHydrateRunning) return;
    if (!(serverHasTmdbKey || tmdbApiKey)) return;

    tmdbSeasonHydrateRunning = true;
    let changed = false;
    const budget = { fetchCount: 0, maxFetches: TMDB_SEASON_HYDRATE_MAX_FETCHES };
    let resolveAttempts = 0;

    try {
        const needGuide = watchlist.filter(
            item =>
                item.type === 'series' &&
                seriesNeedsTmdbSeasonHydration(item) &&
                item.tmdbTvId != null &&
                Number.isFinite(Number(item.tmdbTvId))
        );

        for (const item of needGuide) {
            if (budget.fetchCount >= budget.maxFetches) break;
            const c = await ensureTmdbSeasonGuidesForItem(item, budget);
            if (c) changed = true;
        }

        const needResolve = watchlist.filter(
            item =>
                item.type === 'series' &&
                seriesNeedsTmdbSeasonHydration(item) &&
                (item.tmdbTvId == null || !Number.isFinite(Number(item.tmdbTvId)))
        );

        for (const item of needResolve) {
            if (budget.fetchCount >= budget.maxFetches) break;
            if (resolveAttempts >= TMDB_SEASON_HYDRATE_MAX_RESOLVE_ATTEMPTS) break;
            resolveAttempts++;
            const tvId = await resolveTmdbTvIdForSeries(item);
            if (!tvId) {
                await new Promise(r => setTimeout(r, TMDB_SEASON_HYDRATE_DELAY_MS));
                continue;
            }
            item.tmdbTvId = tvId;
            changed = true;
            const c = await ensureTmdbSeasonGuidesForItem(item, budget);
            if (c) changed = true;
        }

        if (changed) {
            normalizeWatchlistEpisodes();
            saveWatchlist();
            renderWatchlist();
        }
    } catch (e) {
        console.warn('TMDB season guides hydrate', e);
    } finally {
        tmdbSeasonHydrateRunning = false;
    }
}

// ============================================
// OMDB API INTEGRATION
// ============================================

async function searchOMDB(title, year = null) {
    // Use server API if available
    if (serverHasOmdbKey) {
        let url = `/api/omdb?s=${encodeURIComponent(title)}`;
        if (year) url += `&y=${year}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.Response === 'True') {
                return data.Search;
            }
            return [];
        } catch (error) {
            console.error('OMDB search error:', error);
            return [];
        }
    }
    
    if (!omdbApiKey) return null;
    
    let url = `${OMDB_BASE_URL}?apikey=${omdbApiKey}&s=${encodeURIComponent(title)}`;
    if (year) url += `&y=${year}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.Response === 'True') {
            return data.Search;
        } else {
            return [];
        }
    } catch (error) {
        console.error('OMDB search error:', error);
        return [];
    }
}

async function getOMDBDetails(imdbId) {
    if (!imdbId) return null;
    
    // Use server API if available
    if (serverHasOmdbKey) {
        try {
            const response = await fetch(
                `/api/omdb?i=${encodeURIComponent(imdbId)}&plot=${encodeURIComponent('full')}`
            );
            const data = await response.json();
            
            if (data.Response === 'True') {
                return data;
            }
            return null;
        } catch (error) {
            console.error('OMDB details error:', error);
            return null;
        }
    }
    
    if (!omdbApiKey) return null;
    
    try {
        const response = await fetch(`${OMDB_BASE_URL}?apikey=${omdbApiKey}&i=${imdbId}&plot=full`);
        const data = await response.json();
        
        if (data.Response === 'True') {
            return data;
        }
        return null;
    } catch (error) {
        console.error('OMDB details error:', error);
        return null;
    }
}

async function getOMDBByTitle(title, year = null) {
    // Use server API if available
    if (serverHasOmdbKey) {
        let url = `/api/omdb?t=${encodeURIComponent(title)}&plot=full`;
        if (year) url += `&y=${year}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.Response === 'True') {
                return data;
            }
            return null;
        } catch (error) {
            console.error('OMDB details error:', error);
            return null;
        }
    }
    
    if (!omdbApiKey) return null;
    
    let url = `${OMDB_BASE_URL}?apikey=${omdbApiKey}&t=${encodeURIComponent(title)}&plot=full`;
    if (year) url += `&y=${year}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.Response === 'True') {
            return data;
        }
        return null;
    } catch (error) {
        console.error('OMDB details error:', error);
        return null;
    }
}

// ============================================
// UNIFIED SEARCH (TMDB + OMDB)
// ============================================

async function searchForTitle() {
    const titleInput = document.getElementById('title');
    const yearInput = document.getElementById('year');
    const title = titleInput.value.trim();
    
    if (!title) {
        showToast('Please enter a title to search', 'error');
        return;
    }
    
    const hasApiAccess = serverHasTmdbKey || serverHasOmdbKey || tmdbApiKey || omdbApiKey;
    if (!hasApiAccess) {
        showToast('Please set at least one API key in Settings', 'error');
        openSettingsModal();
        return;
    }
    
    // Show loading state
    searchTitleBtn.classList.add('loading');
    searchTitleBtn.disabled = true;
    
    const year = yearInput.value || null;
    let results = [];
    
    // Try TMDB first (better posters)
    if (serverHasTmdbKey || tmdbApiKey) {
        const tmdbResults = await searchTMDB(title, year);
        if (tmdbResults && tmdbResults.length > 0) {
            results = tmdbResults.slice(0, 6).map(r => ({
                id: r.id,
                title: r.title || r.name,
                year: (r.release_date || r.first_air_date || '').split('-')[0],
                type: r.media_type === 'tv' ? 'series' : 'movie',
                mediaType: r.media_type,
                poster: getTMDBPosterUrl(r.poster_path, 'w185'),
                rating: r.vote_average ? r.vote_average.toFixed(1) : null,
                source: 'tmdb'
            }));
        }
    }
    
    // Fallback to OMDB if no TMDB results
    if (results.length === 0 && (serverHasOmdbKey || omdbApiKey)) {
        const omdbResults = await searchOMDB(title, year);
        if (omdbResults && omdbResults.length > 0) {
            results = omdbResults.slice(0, 6).map(r => ({
                id: r.imdbID,
                title: r.Title,
                year: r.Year,
                type: r.Type === 'series' ? 'series' : 'movie',
                poster: r.Poster !== 'N/A' ? r.Poster : '',
                rating: null,
                source: 'omdb'
            }));
        }
    }
    
    searchTitleBtn.classList.remove('loading');
    searchTitleBtn.disabled = false;
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="no-results">No results found. Try a different search term.</div>';
        searchResults.classList.add('active');
        return;
    }
    
    renderSearchResults(results);
}

function renderSearchResults(results) {
    searchResults.innerHTML = results.map(result => {
        return `
            <div class="search-result-item" data-id="${result.id}" data-source="${result.source}" data-media-type="${result.mediaType || result.type}">
                <div class="search-result-poster">
                    ${result.poster 
                        ? `<img src="${result.poster}" alt="${result.title}">`
                        : `<span class="search-result-poster-placeholder">🎬</span>`
                    }
                </div>
                <div class="search-result-info">
                    <div class="search-result-title">${escapeHtml(result.title)}</div>
                    <div class="search-result-meta">
                        <span>${result.year || 'N/A'}</span>
                        <span>${result.type}</span>
                        ${result.rating ? `<span class="search-result-rating">⭐ ${result.rating}</span>` : ''}
                        <span class="search-result-source">${result.source.toUpperCase()}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    searchResults.classList.add('active');
    
    // Add click handlers
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            selectSearchResult(item.dataset.id, item.dataset.source, item.dataset.mediaType);
        });
    });
}

async function selectSearchResult(id, source, mediaType) {
    searchResults.classList.remove('active');
    
    // Show loading
    searchTitleBtn.classList.add('loading');
    searchTitleBtn.disabled = true;
    
    let title = '', year = '', type = 'movie', genre = '', posterUrl = '', imdbId = '', imdbRating = null, rtRating = null, plot = '', runtime = '', director = '';
    
    if (source === 'tmdb') {
        // Search stores TMDB's media_type ("tv" | "movie"), not our form's "series"
        const tmdbMedia =
            mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
        const tmdbDetails = await getTMDBDetails(id, tmdbMedia);
        
        if (tmdbDetails) {
            title = tmdbDetails.title || tmdbDetails.name || '';
            year = (tmdbDetails.release_date || tmdbDetails.first_air_date || '').split('-')[0];
            type = mediaType === 'tv' || mediaType === 'series' ? 'series' : 'movie';
            genre = tmdbDetails.genres ? tmdbDetails.genres.map(g => g.name).join(', ') : '';
            posterUrl = getTMDBPosterUrl(tmdbDetails.poster_path, 'w500');
            plot = tmdbDetails.overview || '';
            runtime = tmdbDetails.runtime ? `${tmdbDetails.runtime} min` : '';
            
            // Get IMDB ID from external_ids
            imdbId = tmdbDetails.external_ids?.imdb_id || '';
            
            director = directorsFromTmdbCrew(tmdbDetails);
            
            const canOmdb = serverHasOmdbKey || omdbApiKey;
            // Now fetch OMDB for IMDB rating and RT score
            if (imdbId && canOmdb) {
                const omdbDetails = await getOMDBDetails(imdbId);
                if (omdbDetails) {
                    if (omdbDetails.imdbRating && omdbDetails.imdbRating !== 'N/A') {
                        imdbRating = parseFloat(omdbDetails.imdbRating);
                    }
                    if (omdbDetails.Ratings) {
                        const rt = omdbDetails.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                        if (rt) rtRating = parseInt(rt.Value);
                    }
                    if (
                        !String(director || '').trim() &&
                        omdbDetails.Director &&
                        omdbDetails.Director !== 'N/A'
                    ) {
                        director = String(omdbDetails.Director).trim();
                    }
                }
            } else if (canOmdb) {
                // Try to get OMDB by title if no IMDB ID
                const omdbDetails = await getOMDBByTitle(title, year);
                if (omdbDetails) {
                    imdbId = omdbDetails.imdbID || '';
                    if (omdbDetails.imdbRating && omdbDetails.imdbRating !== 'N/A') {
                        imdbRating = parseFloat(omdbDetails.imdbRating);
                    }
                    if (omdbDetails.Ratings) {
                        const rt = omdbDetails.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                        if (rt) rtRating = parseInt(rt.Value);
                    }
                    if (
                        !String(director || '').trim() &&
                        omdbDetails.Director &&
                        omdbDetails.Director !== 'N/A'
                    ) {
                        director = String(omdbDetails.Director).trim();
                    }
                }
            }
        }
    } else {
        // OMDB source
        const omdbDetails = await getOMDBDetails(id);
        
        if (omdbDetails) {
            title = omdbDetails.Title || '';
            year = omdbDetails.Year ? parseInt(omdbDetails.Year) : '';
            type = omdbDetails.Type === 'series' ? 'series' : 'movie';
            genre = omdbDetails.Genre || '';
            posterUrl = omdbDetails.Poster !== 'N/A' ? omdbDetails.Poster : '';
            imdbId = id;
            plot = omdbDetails.Plot || '';
            runtime = omdbDetails.Runtime || '';
            director = omdbDetails.Director || '';
            
            if (omdbDetails.imdbRating && omdbDetails.imdbRating !== 'N/A') {
                imdbRating = parseFloat(omdbDetails.imdbRating);
            }
            if (omdbDetails.Ratings) {
                const rt = omdbDetails.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                if (rt) rtRating = parseInt(rt.Value);
            }
            
            // Try to get better poster from TMDB if available
            if (tmdbApiKey) {
                const tmdbResults = await searchTMDB(title, year);
                if (tmdbResults && tmdbResults.length > 0) {
                    const bestMatch = tmdbResults[0];
                    if (bestMatch.poster_path) {
                        posterUrl = getTMDBPosterUrl(bestMatch.poster_path, 'w500');
                    }
                }
            }
        }
    }
    
    searchTitleBtn.classList.remove('loading');
    searchTitleBtn.disabled = false;
    
    if (!title) {
        showToast('Could not fetch details', 'error');
        return;
    }
    
    // Fill in the form
    document.getElementById('title').value = title;
    document.getElementById('year').value = year;
    document.getElementById('type').value = type;
    document.getElementById('genre').value = genre;
;
    const directorField = document.getElementById('director');
    if (directorField) {
        directorField.value =
            director && String(director).trim() && director !== 'N/A' ? String(director).trim() : '';
    }
    document.getElementById('posterUrl').value = posterUrl;
    document.getElementById('imdbLink').value = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '';
    const tmdbTvEl = document.getElementById('tmdbTvIdField');
    if (tmdbTvEl) {
        tmdbTvEl.value =
            source === 'tmdb' && type === 'series' && id ? String(id) : '';
    }
    
    if (imdbRating) {
        document.getElementById('imdbRating').value = imdbRating;
    }
    if (rtRating) {
        document.getElementById('rtRating').value = rtRating;
    }
    
    // Add plot to notes if empty
    const notesField = document.getElementById('notes');
    if (!notesField.value && plot) {
        notesField.value = plot;
    }
    
    showToast(`Loaded details for "${title}"`, 'success');
}

async function bulkFetchDetails(options = {}) {
    const {
        onlyIds = null,
        manageUi = true,
        quietEmpty = false,
        forceRefreshAll = false
    } = options;

    const hasApiAccess = serverHasTmdbKey || serverHasOmdbKey || tmdbApiKey || omdbApiKey;
    if (!hasApiAccess) {
        showToast('Please set at least one API key first', 'error');
        return;
    }

    // Missing poster, ratings, description (notes), director — optionally limit to specific ids
    const needsEnrich = item =>
        !item.posterUrl ||
        item.imdbRating == null ||
        item.imdbRating === '' ||
        !String(item.notes || '').trim() ||
        !String(item.director || '').trim();

    const shouldUpdate = item =>
        (forceRefreshAll || needsEnrich(item)) && (!onlyIds || onlyIds.has(item.id));
    const itemsToUpdate = watchlist.filter(shouldUpdate);

    if (itemsToUpdate.length === 0) {
        if (!quietEmpty) {
            showToast('All items already have posters, ratings, and descriptions!', 'success');
        }
        return;
    }

    const progressDiv = document.getElementById('bulkProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const setBulkButtonsDisabled = (disabled) => {
        if (!manageUi) return;
        if (bulkFetchBtn) bulkFetchBtn.disabled = disabled;
        if (bulkRefetchAllBtn) bulkRefetchAllBtn.disabled = disabled;
    };

    if (progressDiv) progressDiv.style.display = 'flex';
    setBulkButtonsDisabled(true);

    let updated = 0;
    let failed = 0;

    const tryServerBatch = serverHasTmdbKey || serverHasOmdbKey;
    let batchCompletedOk = false;

    if (tryServerBatch) {
        batchCompletedOk = true;
        for (let off = 0; off < itemsToUpdate.length; off += ENRICH_BATCH_SIZE) {
            const chunk = itemsToUpdate.slice(off, off + ENRICH_BATCH_SIZE);
            try {
                const r = await fetch('/api/enrich-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: chunk, forceRefreshAll: !!forceRefreshAll })
                });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const j = await r.json();
                for (const p of j.patches || []) {
                    const idx = watchlist.findIndex(w => w.id === p.id);
                    if (idx === -1) continue;
                    const w = watchlist[idx];
                    if (p.posterUrl) w.posterUrl = p.posterUrl;
                    if (p.imdbRating != null && p.imdbRating !== '') w.imdbRating = p.imdbRating;
                    if (p.imdbLink) w.imdbLink = p.imdbLink;
                    if (p.genre) w.genre = p.genre;
                    if (p.director != null && String(p.director).trim()) {
                        if (forceRefreshAll || !w.director || !String(w.director).trim()) {
                            w.director = String(p.director).trim();
                        }
                    }
                    if (p.rtRating != null && p.rtRating !== '') w.rtRating = p.rtRating;
                    if (
                        (forceRefreshAll || !w.notes || !String(w.notes).trim()) &&
                        p.notes != null &&
                        String(p.notes).trim()
                    ) {
                        w.notes = String(p.notes).trim();
                    }
                    if (p.type === 'movie' || p.type === 'series') w.type = p.type;
                    if (p.type === 'movie') {
                        delete w.tmdbTvId;
                        delete w.tmdbSeason1Guide;
                        delete w.tmdbSeasonGuides;
                        delete w.tmdbTvShowMeta;
                    }
                    if (
                        w.type === 'series' &&
                        p.tmdbTvId != null &&
                        p.tmdbTvId !== ''
                    ) {
                        const tid = parseInt(p.tmdbTvId, 10);
                        if (Number.isFinite(tid) && tid > 0) w.tmdbTvId = tid;
                    }
                }
                updated += j.updated || 0;
                failed += j.failed || 0;
            } catch (err) {
                console.warn('enrich-batch failed', err);
                batchCompletedOk = false;
                break;
            }
            const done = Math.min(off + chunk.length, itemsToUpdate.length);
            if (progressText) progressText.textContent = `${done} / ${itemsToUpdate.length}`;
            if (progressFill) progressFill.style.width = `${(done / itemsToUpdate.length) * 100}%`;
        }
    }

    if (tryServerBatch && batchCompletedOk) {
        saveWatchlist();
        renderWatchlist();
        await hydrateTmdbSeasonGuides();
        if (progressDiv) progressDiv.style.display = 'none';
        setBulkButtonsDisabled(false);
        let message = `Updated ${updated} items with posters, ratings, and descriptions`;
        if (failed > 0) message += ` (${failed} not found)`;
        showToast(message, 'success');
        return;
    }

    let toProcess = itemsToUpdate;
    if (tryServerBatch && !batchCompletedOk) {
        toProcess = watchlist.filter(shouldUpdate);
        if (toProcess.length && !tmdbApiKey && !omdbApiKey) {
            saveWatchlist();
            renderWatchlist();
            if (progressDiv) progressDiv.style.display = 'none';
            setBulkButtonsDisabled(false);
            showToast('Server enrich failed and no browser API keys to fall back on.', 'error');
            return;
        }
        if (toProcess.length) {
            showToast('Finishing with browser API keys…', 'success');
        }
        updated = 0;
        failed = 0;
    }

    for (let i = 0; i < toProcess.length; i++) {
        const item = toProcess[i];
        if (progressText) progressText.textContent = `${i + 1} / ${toProcess.length}`;
        if (progressFill) progressFill.style.width = `${((i + 1) / toProcess.length) * 100}%`;

        const index = watchlist.findIndex(w => w.id === item.id);
        if (index === -1) continue;

        let foundData = false;
        let hadTmdbMatch = false;

        if (serverHasTmdbKey || tmdbApiKey) {
            const tmdbResults = await searchTMDB(item.title, item.year);
            if (tmdbResults && tmdbResults.length > 0) {
                hadTmdbMatch = true;
                const match = tmdbResults[0];
                const inferred = match.media_type === 'tv' ? 'series' : 'movie';
                if (watchlist[index].type !== inferred) {
                    watchlist[index].type = inferred;
                    foundData = true;
                }
                if (match.media_type === 'tv' && match.id) {
                    const mid = parseInt(match.id, 10);
                    if (Number.isFinite(mid) && mid > 0 && watchlist[index].tmdbTvId !== mid) {
                        watchlist[index].tmdbTvId = mid;
                        foundData = true;
                    }
                }
                const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
                const needDetails =
                    forceRefreshAll ||
                    !watchlist[index].posterUrl ||
                    !watchlist[index].genre ||
                    !watchlist[index].imdbLink ||
                    !String(watchlist[index].notes || '').trim() ||
                    !String(watchlist[index].director || '').trim();
                if (needDetails) {
                    const tmdbDetails = await getTMDBDetails(match.id, mediaType);
                    if (tmdbDetails) {
                        if ((forceRefreshAll || !watchlist[index].posterUrl) && tmdbDetails.poster_path) {
                            watchlist[index].posterUrl = getTMDBPosterUrl(tmdbDetails.poster_path, 'w500');
                            foundData = true;
                        }
                        if ((forceRefreshAll || !watchlist[index].genre) && tmdbDetails.genres) {
                            watchlist[index].genre = tmdbDetails.genres.map(g => g.name).join(', ');
                            foundData = true;
                        }
                        if ((forceRefreshAll || !watchlist[index].imdbLink) && tmdbDetails.external_ids?.imdb_id) {
                            watchlist[index].imdbLink = `https://www.imdb.com/title/${tmdbDetails.external_ids.imdb_id}/`;
                            foundData = true;
                        }
                        const dirStr = directorsFromTmdbCrew(tmdbDetails);
                        if (dirStr && (forceRefreshAll || !String(watchlist[index].director || '').trim())) {
                            watchlist[index].director = dirStr;
                            foundData = true;
                        }
                        const ov = String(tmdbDetails.overview || '').trim();
                        if (ov && (forceRefreshAll || !String(watchlist[index].notes || '').trim())) {
                            watchlist[index].notes = ov;
                            foundData = true;
                        }
                    }
                } else if ((forceRefreshAll || !watchlist[index].posterUrl) && match.poster_path) {
                    watchlist[index].posterUrl = getTMDBPosterUrl(match.poster_path, 'w500');
                    foundData = true;
                }
            }
        }

        const canOmdb = serverHasOmdbKey || omdbApiKey;
        const needOmdbRatings =
            forceRefreshAll ||
            watchlist[index].imdbRating == null ||
            watchlist[index].imdbRating === '' ||
            watchlist[index].rtRating == null ||
            watchlist[index].rtRating === '';
        const needOmdbNotes = forceRefreshAll || !String(watchlist[index].notes || '').trim();
        const needOmdbDirector = forceRefreshAll || !String(watchlist[index].director || '').trim();
        if (canOmdb && (!hadTmdbMatch || needOmdbRatings || needOmdbNotes || needOmdbDirector)) {
            const imdbM = String(watchlist[index].imdbLink || '').match(/tt\d+/i);
            let omdbDetails = imdbM ? await getOMDBDetails(imdbM[0]) : null;
            if (!omdbDetails) {
                omdbDetails = await getOMDBByTitle(item.title, item.year);
            }
            if (omdbDetails && omdbDetails.Response === 'True') {
                if (!hadTmdbMatch) {
                    const t = (omdbDetails.Type || '').toLowerCase();
                    if (t === 'series' || t === 'episode') {
                        if (watchlist[index].type !== 'series') {
                            watchlist[index].type = 'series';
                            foundData = true;
                        }
                    } else if (t === 'movie') {
                        if (watchlist[index].type !== 'movie') {
                            watchlist[index].type = 'movie';
                            foundData = true;
                        }
                    }
                }
                if ((forceRefreshAll || !watchlist[index].imdbRating) && omdbDetails.imdbRating && omdbDetails.imdbRating !== 'N/A') {
                    watchlist[index].imdbRating = parseFloat(omdbDetails.imdbRating);
                    foundData = true;
                }
                if ((forceRefreshAll || !watchlist[index].imdbLink) && omdbDetails.imdbID) {
                    watchlist[index].imdbLink = `https://www.imdb.com/title/${omdbDetails.imdbID}/`;
                    foundData = true;
                }
                if ((forceRefreshAll || !watchlist[index].genre) && omdbDetails.Genre) {
                    watchlist[index].genre = omdbDetails.Genre;
                    foundData = true;
                }
                if (
                    (forceRefreshAll || !String(watchlist[index].director || '').trim()) &&
                    omdbDetails.Director &&
                    omdbDetails.Director !== 'N/A'
                ) {
                    watchlist[index].director = omdbDetails.Director;
                    foundData = true;
                }
                if (omdbDetails.Ratings) {
                    const rtRating = omdbDetails.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                    if (rtRating && (forceRefreshAll || !watchlist[index].rtRating)) {
                        const n = parseInt(String(rtRating.Value).replace(/%/g, ''), 10);
                        if (!Number.isNaN(n)) {
                            watchlist[index].rtRating = n;
                            foundData = true;
                        }
                    }
                }
                if ((forceRefreshAll || !watchlist[index].posterUrl) && omdbDetails.Poster !== 'N/A') {
                    watchlist[index].posterUrl = omdbDetails.Poster;
                    foundData = true;
                }
                if (
                    needOmdbNotes &&
                    omdbDetails.Plot &&
                    omdbDetails.Plot !== 'N/A'
                ) {
                    watchlist[index].notes = omdbDetails.Plot;
                    foundData = true;
                }
            }
        }

        if (foundData) {
            updated++;
        } else {
            failed++;
        }

        await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    saveWatchlist();
    renderWatchlist();
    await hydrateTmdbSeasonGuides();

    if (progressDiv) progressDiv.style.display = 'none';
    setBulkButtonsDisabled(false);

    let message = `Updated ${updated} items with posters, ratings, and descriptions`;
    if (failed > 0) {
        message += ` (${failed} not found)`;
    }
    showToast(message, 'success');
}

// Make functions available globally for onclick handlers
window.openModal = openModal;
window.editItem = editItem;
window.deleteItem = deleteItem;
