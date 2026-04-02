// ============================================
// WATCHLIST APP - Main JavaScript
// ============================================

// Storage key
const STORAGE_KEY = 'watchlist_data';

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

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadWatchlist();
    renderWatchlist();
    updateStats();
    setupEventListeners();
});

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
    confirmImportBtn.addEventListener('click', executeImport);
}

// ============================================
// DATA MANAGEMENT
// ============================================

function loadWatchlist() {
    const data = localStorage.getItem(STORAGE_KEY);
    watchlist = data ? JSON.parse(data) : getSampleData();
    saveWatchlist();
}

function saveWatchlist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getSampleData() {
    return [
        {
            id: generateId(),
            title: "Inception",
            year: 2010,
            type: "movie",
            status: "watched",
            genre: "Sci-Fi, Thriller",
            myRating: 9.2,
            posterUrl: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg",
            imdbLink: "https://www.imdb.com/title/tt1375666/",
            letterboxdLink: "https://letterboxd.com/film/inception/",
            rottenTomatoesLink: "https://www.rottentomatoes.com/m/inception",
            justWatchLink: "https://www.justwatch.com/us/movie/inception",
            notes: "Mind-bending masterpiece! The ending still makes me think.",
            dateAdded: new Date().toISOString()
        },
        {
            id: generateId(),
            title: "Breaking Bad",
            year: 2008,
            type: "series",
            status: "watched",
            genre: "Crime, Drama",
            myRating: 9.8,
            posterUrl: "https://m.media-amazon.com/images/M/MV5BYmQ4YWMxYjUtNjZmYi00MDQ1LWFjMjMtNjA5ZDdiYjdiODU5XkEyXkFqcGdeQXVyMTMzNDExODE5._V1_SX300.jpg",
            imdbLink: "https://www.imdb.com/title/tt0903747/",
            letterboxdLink: "",
            rottenTomatoesLink: "https://www.rottentomatoes.com/tv/breaking_bad",
            justWatchLink: "https://www.justwatch.com/us/tv-show/breaking-bad",
            notes: "Best TV series ever made. Walter White's transformation is incredible.",
            dateAdded: new Date().toISOString()
        },
        {
            id: generateId(),
            title: "Dune: Part Two",
            year: 2024,
            type: "movie",
            status: "want-to-watch",
            genre: "Sci-Fi, Adventure",
            myRating: null,
            posterUrl: "https://m.media-amazon.com/images/M/MV5BN2QyZGU4ZDctOWMzMy00NTc5LThlOGQtODhmNDI1NmY5YzAwXkEyXkFqcGdeQXVyMDM2NDM2MQ@@._V1_SX300.jpg",
            imdbLink: "https://www.imdb.com/title/tt15239678/",
            letterboxdLink: "https://letterboxd.com/film/dune-part-two/",
            rottenTomatoesLink: "https://www.rottentomatoes.com/m/dune_part_two",
            justWatchLink: "https://www.justwatch.com/us/movie/dune-part-two",
            notes: "Heard amazing things! Need to watch Part 1 first.",
            dateAdded: new Date().toISOString()
        },
        {
            id: generateId(),
            title: "The Last of Us",
            year: 2023,
            type: "series",
            status: "watching",
            genre: "Drama, Horror",
            myRating: 8.5,
            posterUrl: "https://m.media-amazon.com/images/M/MV5BZGUzYTI3M2EtZmM0Yy00NGUyLWI4ODEtN2Q3ZGJlYzhhZjU3XkEyXkFqcGdeQXVyNTM0OTY1OQ@@._V1_SX300.jpg",
            imdbLink: "https://www.imdb.com/title/tt3581920/",
            letterboxdLink: "",
            rottenTomatoesLink: "https://www.rottentomatoes.com/tv/the_last_of_us",
            justWatchLink: "https://www.justwatch.com/us/tv-show/the-last-of-us",
            notes: "On episode 5. So emotional!",
            dateAdded: new Date().toISOString()
        }
    ];
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
                        <span>${item.myRating}</span>
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
    return data.map(row => {
        // Letterboxd exports can have different formats
        const title = row.name || row.title || row.film || '';
        const year = parseInt(row.year) || null;
        const rating = row.rating ? parseFloat(row.rating) * 2 : null; // Letterboxd uses 0-5, we use 0-10
        const letterboxdUri = row['letterboxd uri'] || row.uri || '';
        const watchedDate = row['watched date'] || row.date || '';
        
        // Determine status based on available data
        let status = 'watched';
        if (row.watchlist || (!rating && !watchedDate)) {
            status = 'want-to-watch';
        }
        
        return {
            id: generateId(),
            title: title,
            year: year,
            type: 'movie', // Letterboxd is primarily movies
            status: status,
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
        
        // Determine status
        let status = 'watched';
        if (!yourRating && row.watchlist) {
            status = 'want-to-watch';
        }
        
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
    return data.map(row => {
        const title = row.title || row.name || row.film || row.movie || '';
        const year = parseInt(row.year || row.release_year) || null;
        const type = (row.type || 'movie').toLowerCase().includes('series') ? 'series' : 'movie';
        const status = normalizeStatus(row.status);
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
    
    // Build preview table
    const thead = previewTable.querySelector('thead');
    const tbody = previewTable.querySelector('tbody');
    
    thead.innerHTML = '<tr><th>Title</th><th>Year</th><th>Type</th><th>Rating</th></tr>';
    tbody.innerHTML = pendingImports.slice(0, 50).map(item => `
        <tr>
            <td>${escapeHtml(item.title)}</td>
            <td>${item.year || '-'}</td>
            <td>${item.type}</td>
            <td>${item.myRating || '-'}</td>
        </tr>
    `).join('');
    
    if (pendingImports.length > 50) {
        tbody.innerHTML += `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">... and ${pendingImports.length - 50} more</td></tr>`;
    }
}

function executeImport() {
    const skipDuplicates = document.getElementById('skipDuplicates').checked;
    const markAsWatched = document.getElementById('markAsWatched').checked;
    
    let imported = 0;
    let skipped = 0;
    
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
        
        // Override status if checkbox is checked
        if (markAsWatched) {
            item.status = 'watched';
        }
        
        watchlist.push(item);
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
    showToast(message, 'success');
}

// Make functions available globally for onclick handlers
window.openModal = openModal;
window.editItem = editItem;
window.deleteItem = deleteItem;
