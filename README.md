# 🎬 Watchlist - Movies & Series Tracker

A beautiful, modern watchlist application to track your movies and TV series. Keep track of what you've watched, what you're currently watching, and what you want to watch next!

## 📁 Project Structure

```
A-watchlist/
├── client/                 # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server/                 # Backend (Node.js/Express)
│   └── index.js            # API proxy server
├── package.json
├── .env.example            # Template for API keys
├── .gitignore              # Keeps .env out of git
└── README.md
```

## Features

- **Track Movies & Series** - Add any movie or TV show to your personal watchlist
- **Watch Status** - Mark items as "Want to Watch", "Watching", or "Watched"
- **Personal Ratings** - Rate titles on a scale of 0-10
- **External Links** - Quick links to IMDB, Letterboxd, Rotten Tomatoes, and JustWatch
- **Search & Filter** - Easily find titles in your watchlist
- **Notes** - Add personal notes, recommendations, or viewing platform info
- **Poster Images** - Display movie posters for a visual library
- **Statistics** - See your watching stats at a glance
- **Local Storage** - Your data persists in your browser
- **Responsive Design** - Works beautifully on desktop, tablet, and mobile

## Quick Start

### Option 1: Client Only (Static - users enter own API keys)

```bash
# Just open in browser
open client/index.html

# Or serve with any static server
npx serve client
```

### Option 2: Full Stack (Your API keys hidden in .env)

```bash
# 1. Create .env with your API keys
cp .env.example .env
# Edit .env and add your actual keys

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open http://localhost:3000
```

### Option 3: Deploy to CodeSandbox

1. Push to GitHub (your `.env` is gitignored - safe!)
2. Import repo to [CodeSandbox](https://codesandbox.io/)
3. Go to **Settings** → **Env Variables**
4. Add:
   - `OMDB_API_KEY` = your OMDB key
   - `TMDB_API_KEY` = your TMDB key
5. Done! Auto-fetch works without exposing keys.

### Option 4: Deploy Client to GitHub Pages

1. Push `client/` folder to GitHub
2. **Settings** → **Pages** → Select branch
3. Users will enter their own API keys in Settings

## How to Use

### Importing from Letterboxd
1. Click the **"Import"** button
2. Go to [letterboxd.com/settings/data/](https://letterboxd.com/settings/data/)
3. Click **"Export Your Data"** and download the ZIP
4. Extract and upload one of these files:
   - `watched.csv` - All films you've watched
   - `ratings.csv` - Films with your ratings  
   - `watchlist.csv` - Your want-to-watch list
   - `diary.csv` - Your diary entries
5. Preview the import and click **"Import"**

### Importing from IMDB
1. Click the **"Import"** button and select the **IMDB** tab
2. Go to your [IMDB Ratings](https://www.imdb.com/list/ratings) or [Watchlist](https://www.imdb.com/list/watchlist)
3. Click the **three dots menu (⋮)** → **Export**
4. Upload the downloaded CSV file
5. Preview and import!

### Adding a Title Manually
1. Click the **"Add New"** button
2. Fill in the title details:
   - **Title** (required): The name of the movie/series
   - **Year**: Release year
   - **Type**: Movie or Series
   - **Status**: Want to Watch, Watching, or Watched
   - **Genre**: e.g., "Sci-Fi, Action"
   - **My Rating**: Your personal rating (0-10)
   - **Poster URL**: Link to a poster image
   - **External Links**: IMDB, Letterboxd, Rotten Tomatoes, JustWatch
   - **Notes**: Your thoughts or viewing notes
3. Click **Save**

### Finding Poster URLs
You can get poster URLs from:
- **OMDB API**: Search at [OMDb API](http://www.omdbapi.com/)
- **TMDB**: Get images from [The Movie Database](https://www.themoviedb.org/)
- **Google Images**: Right-click an image and copy image address

### Filtering & Searching
- Use the **search bar** to find titles by name, genre, or notes
- Use the **filter buttons** to show only Movies, Series, or by watch status

### Keyboard Shortcuts
- `Ctrl/Cmd + N`: Add new title
- `Esc`: Close modal

## Customization

### Adding More Link Types
Edit the `app.js` file to add more external links. Look for the `links` array in the `createCard` function.

### Changing Colors
Edit the CSS variables in `styles.css` under `:root` to customize the color scheme.

### Adding More Fields
1. Add input fields in `index.html` inside the form
2. Update `handleFormSubmit()` in `app.js` to capture the new fields
3. Update `createCard()` to display the new information

## Data Storage

Your watchlist data is stored in your browser's **localStorage**. This means:
- ✅ Data persists between browser sessions
- ✅ No account or server needed
- ⚠️ Data is browser-specific (not synced across devices)
- ⚠️ Clearing browser data will delete your watchlist

### Export Your Data
Open browser console (F12) and run:
```javascript
console.log(JSON.stringify(JSON.parse(localStorage.getItem('watchlist_data')), null, 2));
```

### Import Data
```javascript
localStorage.setItem('watchlist_data', JSON.stringify(yourDataArray));
location.reload();
```

## Tech Stack

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with CSS variables, Grid, Flexbox
- **Vanilla JavaScript** - No frameworks, just clean ES6+
- **Google Fonts** - Bebas Neue & Inter fonts
- **LocalStorage API** - Client-side data persistence

## Browser Support

Works in all modern browsers:
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

MIT License - Feel free to use and modify!

---

Made with 🎬 for movie lovers
