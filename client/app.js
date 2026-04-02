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
const clearDataBtn = document.getElementById('clearDataBtn');
const bulkFetchBtn = document.getElementById('bulkFetchBtn');

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
let searchQuery = '';
let editingId = null;
let currentImportSource = 'letterboxd';
let pendingImports = [];
let omdbApiKey = '';
let tmdbApiKey = '';
let detectedImportStatus = 'watched';

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

document.addEventListener('DOMContentLoaded', async () => {
    initProfileFromUrl();
    initListModeFromUrl();
    loadApiKey();
    await checkServerConfig();
    await loadWatchlist();
    updateListModeTabs();
    updateProfileBar();
    updateProfileBarForMode();
    updateEmptyStateCopy();
    updateSyncBanner();
    renderWatchlist();
    updateStats();
    setupEventListeners();
});

// Check if server has API keys configured
async function checkServerConfig() {
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
        }
    } catch (error) {
        console.log('Using client-side API keys');
    }
}

function updateSyncBanner() {
    const el = document.getElementById('syncBannerNoCloud');
    if (!el) return;
    el.style.display = hasCloudSync ? 'none' : 'block';
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
    
    // Search
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderWatchlist();
    });
    
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderWatchlist();
        });
    });
    
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
    
    // Import actions
    cancelImportBtn.addEventListener('click', resetImport);
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
                    watchlist = j.items;
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
    const filtered = filterWatchlist();
    
    if (filtered.length === 0) {
        watchlistGrid.innerHTML = '';
        emptyState.classList.add('visible');
        return;
    }
    
    emptyState.classList.remove('visible');
    watchlistGrid.innerHTML = filtered.map(item => createCard(item)).join('');
}

function filterWatchlist() {
    return watchlist.filter(item => {
        // Search filter
        const matchesSearch = !searchQuery || 
            item.title.toLowerCase().includes(searchQuery) ||
            (item.genre && item.genre.toLowerCase().includes(searchQuery)) ||
            (item.notes && item.notes.toLowerCase().includes(searchQuery));
        
        // Category filter
        let matchesFilter = true;
        if (currentFilter === 'movie') matchesFilter = item.type === 'movie';
        else if (currentFilter === 'series') matchesFilter = item.type === 'series';
        else if (currentFilter === 'watched') matchesFilter = item.status === 'watched';
        else if (currentFilter === 'watching') matchesFilter = item.status === 'watching';
        else if (currentFilter === 'want-to-watch') matchesFilter = item.status === 'want-to-watch';
        
        return matchesSearch && matchesFilter;
    });
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
                ${(item.imdbRating || item.rtRating) ? `
                    <div class="card-ratings">
                        ${item.imdbRating ? `<span class="card-imdb-rating">⭐ IMDB ${item.imdbRating}</span>` : ''}
                        ${item.rtRating ? `<span class="card-rt-rating">🍅 ${item.rtRating}%</span>` : ''}
                    </div>
                ` : ''}
                ${item.notes ? `<p class="card-notes">${escapeHtml(item.notes)}</p>` : ''}
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
        document.getElementById('myRating').value = item.myRating || '';
        document.getElementById('imdbRating').value = item.imdbRating || '';
        document.getElementById('rtRating').value = item.rtRating || '';
        document.getElementById('posterUrl').value = item.posterUrl || '';
        document.getElementById('imdbLink').value = item.imdbLink || '';
        document.getElementById('letterboxdLink').value = item.letterboxdLink || '';
        document.getElementById('rottenTomatoesLink').value = item.rottenTomatoesLink || '';
        document.getElementById('justWatchLink').value = item.justWatchLink || '';
        document.getElementById('notes').value = item.notes || '';
    } else {
        modalTitle.textContent = 'Add New Title';
        watchlistForm.reset();
        document.getElementById('editId').value = '';
    }
    
    modalOverlay.classList.add('active');
    document.getElementById('title').focus();
}

function closeModal() {
    modalOverlay.classList.remove('active');
    editingId = null;
    watchlistForm.reset();
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
    
    const editId = document.getElementById('editId').value;
    
    if (editId) {
        // Update existing
        const index = watchlist.findIndex(i => i.id === editId);
        if (index !== -1) {
            watchlist[index] = { ...watchlist[index], ...formData };
            showToast('Title updated successfully!', 'success');
        }
    } else {
        // Add new
        const newItem = {
            id: generateId(),
            ...formData,
            dateAdded: new Date().toISOString()
        };
        watchlist.unshift(newItem);
        showToast('Title added to your watchlist!', 'success');
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
    resetImport();
}

function closeImportModal() {
    importModalOverlay.classList.remove('active');
    resetImport();
}

function resetImport() {
    pendingImports = [];
    importFile.value = '';
    importPreview.style.display = 'none';
    importDropzone.style.display = 'block';
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
        
        return {
            id: generateId(),
            title: title,
            year: year,
            type: 'movie',
            status: defaultStatus, // Will be overridden by user selection if not auto
            genre: '',
            myRating: rating,
            posterUrl: '',
            imdbLink: '',
            letterboxdLink: letterboxdUri ? `https://letterboxd.com${letterboxdUri}` : '',
            rottenTomatoesLink: '',
            justWatchLink: '',
            notes: watchedDate ? `Watched: ${watchedDate}` : '',
            dateAdded: new Date().toISOString()
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
            myRating: yourRating,
            posterUrl: '',
            imdbLink: imdbId ? `https://www.imdb.com/title/${imdbId}/` : '',
            letterboxdLink: '',
            rottenTomatoesLink: '',
            justWatchLink: '',
            notes: '',
            dateAdded: new Date().toISOString()
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
        
        return {
            id: generateId(),
            title: title,
            year: year,
            type: type,
            status: status,
            genre: genre,
            myRating: rating > 10 ? rating / 10 : rating, // Normalize if 0-100 scale
            posterUrl: row.poster || row.poster_url || row.image || '',
            imdbLink: row.imdb || row.imdb_link || row.imdb_url || '',
            letterboxdLink: row.letterboxd || row.letterboxd_link || '',
            rottenTomatoesLink: row.rotten_tomatoes || row.rt_link || '',
            justWatchLink: row.justwatch || row.justwatch_link || '',
            notes: row.notes || row.comments || row.review || '',
            dateAdded: new Date().toISOString()
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

function showPreview() {
    if (pendingImports.length === 0) {
        showToast('No valid entries found to import', 'error');
        return;
    }
    
    importDropzone.style.display = 'none';
    importPreview.style.display = 'block';
    
    document.getElementById('previewCount').textContent = `(${pendingImports.length} items)`;
    document.getElementById('importCountBtn').textContent = pendingImports.length;
    
    // Set the status dropdown based on detected status
    const importStatusSelect = document.getElementById('importStatus');
    importStatusSelect.value = 'auto';
    
    // Update the auto option text to show detected status
    const autoOption = importStatusSelect.querySelector('option[value="auto"]');
    const statusLabels = {
        'watched': 'Watched',
        'watching': 'Watching',
        'want-to-watch': 'Want to Watch'
    };
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
    updateSyncBanner();
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
    showToast('Exported! Send this file to import on another device.', 'success');
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
            const merged = valid.map((it) => ({
                id: it.id || generateId(),
                title: it.title.trim(),
                year: it.year != null ? parseInt(it.year, 10) || null : null,
                type: it.type === 'series' ? 'series' : 'movie',
                status: it.status || 'want-to-watch',
                genre: it.genre || '',
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
            }));

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
            saveWatchlist();
            if (hasCloudSync) pushWatchlistToCloud();
            renderWatchlist();
            updateStats();
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

async function getTMDBDetails(id, mediaType) {
    // Use server API if available
    if (serverHasTmdbKey) {
        try {
            const response = await fetch(`/api/tmdb/${mediaType}/${id}`);
            const data = await response.json();
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
            const response = await fetch(`/api/omdb?i=${encodeURIComponent(imdbId)}`);
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
        const response = await fetch(`${OMDB_BASE_URL}?apikey=${omdbApiKey}&i=${imdbId}&plot=short`);
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
        let url = `/api/omdb?t=${encodeURIComponent(title)}`;
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
    
    let url = `${OMDB_BASE_URL}?apikey=${omdbApiKey}&t=${encodeURIComponent(title)}`;
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
        // Fetch from TMDB
        const tmdbDetails = await getTMDBDetails(id, mediaType === 'series' ? 'tv' : 'movie');
        
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
            
            // Director from credits
            if (tmdbDetails.credits?.crew) {
                const directors = tmdbDetails.credits.crew.filter(c => c.job === 'Director');
                director = directors.map(d => d.name).join(', ');
            }
            
            // Now fetch OMDB for IMDB rating and RT score
            if (imdbId && omdbApiKey) {
                const omdbDetails = await getOMDBDetails(imdbId);
                if (omdbDetails) {
                    if (omdbDetails.imdbRating && omdbDetails.imdbRating !== 'N/A') {
                        imdbRating = parseFloat(omdbDetails.imdbRating);
                    }
                    if (omdbDetails.Ratings) {
                        const rt = omdbDetails.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                        if (rt) rtRating = parseInt(rt.Value);
                    }
                }
            } else if (omdbApiKey) {
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
    document.getElementById('posterUrl').value = posterUrl;
    document.getElementById('imdbLink').value = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '';
    
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
    const { onlyIds = null, manageUi = true, quietEmpty = false } = options;

    const hasApiAccess = serverHasTmdbKey || serverHasOmdbKey || tmdbApiKey || omdbApiKey;
    if (!hasApiAccess) {
        showToast('Please set at least one API key first', 'error');
        return;
    }

    // Find items missing posters or ratings (optionally limit to specific ids, e.g. just imported)
    const itemsToUpdate = watchlist.filter(item =>
        (!item.posterUrl || !item.imdbRating) &&
        (!onlyIds || onlyIds.has(item.id))
    );

    if (itemsToUpdate.length === 0) {
        if (!quietEmpty) {
            showToast('All items already have posters and ratings!', 'success');
        }
        return;
    }

    const progressDiv = document.getElementById('bulkProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressDiv) progressDiv.style.display = 'flex';
    if (bulkFetchBtn && manageUi) bulkFetchBtn.disabled = true;
    
    let updated = 0;
    let failed = 0;
    
    for (let i = 0; i < itemsToUpdate.length; i++) {
        const item = itemsToUpdate[i];
        if (progressText) progressText.textContent = `${i + 1} / ${itemsToUpdate.length}`;
        if (progressFill) progressFill.style.width = `${((i + 1) / itemsToUpdate.length) * 100}%`;
        
        const index = watchlist.findIndex(w => w.id === item.id);
        if (index === -1) continue;
        
        let foundData = false;
        
        // Try TMDB first for better posters
        if ((serverHasTmdbKey || tmdbApiKey) && !watchlist[index].posterUrl) {
            const tmdbResults = await searchTMDB(item.title, item.year);
            if (tmdbResults && tmdbResults.length > 0) {
                const match = tmdbResults[0];
                if (match.poster_path) {
                    watchlist[index].posterUrl = getTMDBPosterUrl(match.poster_path, 'w500');
                    foundData = true;
                }
                
                // Get more details
                const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
                const tmdbDetails = await getTMDBDetails(match.id, mediaType);
                if (tmdbDetails) {
                    if (!watchlist[index].genre && tmdbDetails.genres) {
                        watchlist[index].genre = tmdbDetails.genres.map(g => g.name).join(', ');
                    }
                    if (tmdbDetails.external_ids?.imdb_id) {
                        watchlist[index].imdbLink = `https://www.imdb.com/title/${tmdbDetails.external_ids.imdb_id}/`;
                    }
                }
            }
        }
        
        // Use OMDB for IMDB ratings
        if ((serverHasOmdbKey || omdbApiKey) && !watchlist[index].imdbRating) {
            const omdbDetails = await getOMDBByTitle(item.title, item.year);
            if (omdbDetails) {
                if (omdbDetails.imdbRating && omdbDetails.imdbRating !== 'N/A') {
                    watchlist[index].imdbRating = parseFloat(omdbDetails.imdbRating);
                    foundData = true;
                }
                if (!watchlist[index].imdbLink && omdbDetails.imdbID) {
                    watchlist[index].imdbLink = `https://www.imdb.com/title/${omdbDetails.imdbID}/`;
                }
                if (!watchlist[index].genre && omdbDetails.Genre) {
                    watchlist[index].genre = omdbDetails.Genre;
                }
                if (omdbDetails.Ratings) {
                    const rtRating = omdbDetails.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                    if (rtRating && !watchlist[index].rtRating) {
                        watchlist[index].rtRating = parseInt(rtRating.Value);
                    }
                }
                // Use OMDB poster if we still don't have one
                if (!watchlist[index].posterUrl && omdbDetails.Poster !== 'N/A') {
                    watchlist[index].posterUrl = omdbDetails.Poster;
                    foundData = true;
                }
            }
        }
        
        if (foundData) {
            updated++;
        } else {
            failed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    saveWatchlist();
    renderWatchlist();

    if (progressDiv) progressDiv.style.display = 'none';
    if (bulkFetchBtn && manageUi) bulkFetchBtn.disabled = false;

    let message = `Updated ${updated} items with posters/ratings`;
    if (failed > 0) {
        message += ` (${failed} not found)`;
    }
    showToast(message, 'success');
}

// Make functions available globally for onclick handlers
window.openModal = openModal;
window.editItem = editItem;
window.deleteItem = deleteItem;
