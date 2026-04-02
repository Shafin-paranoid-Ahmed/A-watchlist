# 🎬 Watchlist - Movies & Series Tracker

A beautiful, modern watchlist application to track your movies and TV series. Keep track of what you've watched, what you're currently watching, and what you want to watch next!

## 📁 Project Structure

```
A-watchlist/
├── client/                 # Frontend source (HTML/CSS/JS)
├── public/                 # Generated on Vercel build — gitignored locally
├── server/                 # Express API + app export for Vercel
├── scripts/                # e.g. copy client → public for deploy
├── index.js                # Vercel entry (exports Express app)
├── package.json
├── .env.example
├── .gitignore
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

## 🚀 Deployment Guide

### Deploy to CodeSandbox (Recommended)

**Step 1: Push to GitHub**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```
> ⚠️ Make sure `.env` is in `.gitignore` - your API keys won't be pushed!

**Step 2: Import to CodeSandbox**
1. Go to [codesandbox.io](https://codesandbox.io/)
2. Click **"Create Sandbox"** → **"Import Repository"**
3. Paste your GitHub repo URL
4. Select **"Node.js"** as the template

**Step 3: Add Environment Variables**
1. In CodeSandbox, click the **⚙️ Settings** icon (bottom left)
2. Go to **"Env Variables"**
3. Add these variables:
   | Key | Value |
   |-----|-------|
   | `OMDB_API_KEY` | your_omdb_key_here |
   | `TMDB_API_KEY` | your_tmdb_key_here |
4. Click **"Save"**

**Step 4: Done!**
- Your app will auto-restart with the keys loaded
- Share the CodeSandbox URL with anyone!
- API keys are hidden from users

---

### Deploy to Vercel

Vercel treats this repo as an **Express** app. Static files must live in `public/` at deploy time, so we run `vercel-build` to copy `client/` → `public/`. Your API keys only go in the Vercel dashboard (never in git).

**Step 1: Push the repo to GitHub** (same as CodeSandbox — no `.env` committed)

**Step 2: Import the project**
1. Go to [vercel.com/new](https://vercel.com/new)
2. **Import** your Git repository
3. Vercel usually auto-detects **Express**; leave the root directory as **.**

**Step 3: Environment variables** (Project → Settings → Environment Variables)

| Name | Value |
|------|--------|
| `OMDB_API_KEY` | Your OMDB key |
| `TMDB_API_KEY` | Your TMDB **API key** (not the word `NULL` — get a real key from TMDB) |

Apply to **Production** (and **Preview** if you want previews to work too).

**Step 4: Build**

- **Install Command:** `npm install` (default)
- **Build Command:** `npm run build` (default when Vercel sees a `build` script in `package.json`).  
  This copies `client/` → `public/` so Vercel’s CDN can serve your HTML/CSS/JS ([Express on Vercel](https://vercel.com/docs/frameworks/backend/express) ignores `express.static()`).

Do **not** set a custom **Output Directory** to `client` for this full-stack setup — the Express app plus `public/` is the correct layout.

**Step 5: Deploy**

Click **Deploy**. Open the production URL: the HTML/CSS/JS load from `public/`, and `/api/*` hits your Express routes with server-side secrets.

**Local check (optional)**  
`npm install` then `npx vercel dev` (requires [Vercel CLI](https://vercel.com/docs/cli)).

---

### Deploy to Render / Railway

Use **Docker** or a **Node web service**:

- **Build:** `npm install && npm run vercel-build` (optional `public/` copy if you serve static from disk), or `npm install` only if the platform serves `client/` another way
- **Start:** `npm start` (runs `node server/index.js`)

Set the same env vars: `OMDB_API_KEY`, `TMDB_API_KEY`. On Render/Railway, `express.static` for `./client` still runs, so you may **skip** `vercel-build` unless you rely on a `public/` folder.

---

### Deploy Client Only (GitHub Pages / Netlify)

If you just want the static client (users enter their own API keys):

1. Push the `client/` folder contents to GitHub
2. **GitHub:** Settings → Pages → Select branch → Set folder to `/client`
3. **Netlify:** Drag & drop the `client` folder

> Note: Without the server, users must enter their own API keys in Settings

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

## 🔑 Getting API Keys

### TMDB API Key (Recommended - better posters)
1. Sign up at [themoviedb.org](https://www.themoviedb.org/signup)
2. Go to [Settings → API](https://www.themoviedb.org/settings/api)
3. Click **"Create"** → Select **"Developer"**
4. Fill out the form (use "Personal" for type)
5. Copy **"API Key (v3 auth)"**

### OMDB API Key (for IMDB ratings)
1. Go to [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx)
2. Select **"FREE! (1,000 daily limit)"**
3. Enter your email and submit
4. Check email and click verification link
5. Copy your API key

---

## Tech Stack

**Client:**
- HTML5, CSS3, Vanilla JavaScript (ES6+)
- Google Fonts (Bebas Neue & Inter)
- LocalStorage for data persistence

**Server:**
- Node.js + Express
- API proxy for OMDB & TMDB

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
