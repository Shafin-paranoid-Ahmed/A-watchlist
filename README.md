# 🎬 Watchlist - Movies & Series Tracker

One site for **your** movies and shows: **import your backlog** (Letterboxd / IMDb CSV—there is no Letterboxd API), **auto-fill** posters and ratings (TMDB / OMDB), and **share the same deployment** with someone else using a **separate profile link** (`?p=`) so their list is not mixed with yours.

| What you want | How this app does it |
|----------------|----------------------|
| Not re-type your backlog | **Import** CSV from Letterboxd or IMDb, optionally **Fetch** / bulk-enrich with TMDB & OMDB. |
| Girlfriend adds her own backlog | She uses **My list** with her link, e.g. `?p=jane`, and imports her CSV—different `?p=` = different personal list. |
| A **shared playlist** for things to watch **together** | Click **Watch together** (or open `?list=shared`). One queue for both of you; **Copy together link** to share. Stored as its own row in Supabase (`watch-together` by default; override with `SHARED_LIST_SLUG`). |
| Same data on phone and PC | **Supabase** + env vars (see Vercel section). Without it, lists stay in the browser only. |

**Privacy:** Treat `?p=...` like a weak password—use a long random slug if you care who can guess the URL.

### “I copied the link but my girlfriend sees an empty list”

The URL does **not** contain your movies. It only selects which list name to open. Your rows are stored **in the browser** until you add **Supabase** + env vars on the server—then the same `?p=` (or `?list=shared`) loads the same data from the database on any device.

**Quick workaround without a database:** you **Export Watchlist** (JSON) in Settings, send her the file (AirDrop, WhatsApp, etc.), she opens your site, switches to the same profile if needed, and uses **Import backup (.json)**.

## 📁 Project Structure

```
A-watchlist/
├── client/
├── public/                  # build output — gitignored
├── server/
├── scripts/
├── supabase-watchlists.sql  # run once in Supabase for cloud sync
├── index.js
├── package.json
├── .env.example
└── README.md
```

## Features

- **CSV import** — Letterboxd / IMDb exports; **custom CSV** with flexible columns
- **Paste titles** — Paste one or many movie/TV names (one per line, or split with `|` / `;`); optional year like `Title (1999)` or `Title — 2022`. Adds to **whatever list is active** (My list or Watch together), default status **Want to Watch**
- **Profiles (`?p=`)** — Separate personal lists; header **Copy link** / **Switch list**
- **Watch together** — Shared queue (`?list=shared`); optional `SHARED_LIST_SLUG` env for the Supabase row name
- **Optional cloud sync** — Supabase; server holds the secret key only (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`)
- **Proxied API keys** — TMDB / OMDB on the server so deploys can use env vars without exposing keys in the browser
- **Bulk enrich** — Settings → **Fetch missing posters & ratings**; after CSV/paste import, the app **auto-enriches** new rows when the server has TMDB/OMDB configured (uses **`POST /api/enrich-batch`** with parallel upstream calls for speed)
- **JSON backup** — Settings → **Export Watchlist** / **Import backup (.json)** for moving data without Supabase
- **Search & filters** — Debounced search; filter by type and watch status
- **Title lookup** — TMDB + OMDB search when adding or editing a title
- **Responsive UI**

## Running locally

You need **Node.js 18+** ([nodejs.org](https://nodejs.org)).

### Full stack (recommended)

The dev server serves the UI from **`client/`** and exposes **`/api/*`** (config, OMDB/TMDB proxies, optional Supabase sync, batch enrich).

```bash
# 1. Clone and install
git clone <your-repo-url>
cd A-watchlist
npm install

# 2. Environment variables (project root and/or server/ — both are loaded)
copy .env.example .env
# On macOS/Linux: cp .env.example .env
# Edit .env: set OMDB_API_KEY, TMDB_API_KEY (optional but needed for search/enrich)
# Optional: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for cloud sync (see Supabase section)

# 3. Start Express
npm start
# Same as: npm run dev  →  node server/index.js

# 4. Open the app
# Browser: http://localhost:3000
# Port: set PORT=8080 in .env to use another port (default 3000)
```

What happens:

- **`npm start`** runs `server/index.js`, which loads `.env` from **`server/.env`** and the **project root** `.env` (see `server/index.js`).
- Static files are served from **`client/`** when **`VERCEL`** is not set.
- **`npm run build`** copies `client/` → **`public/`** (used for **Vercel** deploys). You do **not** have to run `build` for normal local full-stack dev.

### Client only (no backend)

If you open the HTML file directly or serve **`client/`** alone, `/api/*` will not exist: put TMDB/OMDB keys in **Settings** in the UI (stored in `localStorage`), or use a static host without proxies.

```bash
npm run client
# Runs: npx serve client — use the URL it prints (if 3000 is busy, serve picks another port)
```

You can also open `client/index.html` in a browser (some features may be limited by file:// CORS).

### Optional: match Vercel locally

Install the [Vercel CLI](https://vercel.com/docs/cli), then from the repo root:

```bash
npm install
npm run build
npx vercel dev
```

This uses the same `public/` + Express layout as production.

---

## Quick reference (deploy vs local)

| | Local full stack | Vercel |
|--|------------------|--------|
| Start | `npm start` | Deploy with build `npm run build` |
| Static UI | Served from `client/` | Served from `public/` (copy step in build) |
| Env vars | `.env` / `server/.env` | Project → Settings → Environment Variables |

---

## Supabase setup (cloud sync)

This stores each watchlist in a Postgres database so **shared links show real data** on any phone or browser. The app never puts your Supabase **service role** key in the frontend—only your Node server uses it.

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New project**.
3. Choose an **Organization**, **Name** (e.g. `watchlist`), **Database password** (save it somewhere safe—you rarely need it for this app), and **Region** close to you.
4. Click **Create new project** and wait until the dashboard says the project is ready (usually 1–2 minutes).

### 2. Create the `watchlists` table

1. In the Supabase sidebar, open **SQL Editor**.
2. Click **New query**.
3. Open the file **`supabase-watchlists.sql`** from this repo, copy **all** of its contents, paste into the editor, and click **Run** (or press the shortcut shown in the UI).
4. You should see “Success” with no errors.  
   - This creates a table `public.watchlists` with columns: `profile_slug`, `data` (JSON array of titles), `updated_at`.

### 3. Get the project URL and the **secret** key (not the publishable one)

The dashboard often shows **Publishable key** and **Secret key** instead of “anon” / “service_role”. This app runs on your **server**, so you need the URL + **secret** only.

#### **`SUPABASE_URL` (project URL)**

It always looks like: `https://xxxxxxxx.supabase.co`

- Open **Project Settings** (gear) → **General**. Look for **Project URL**, or copy the **Reference ID** and build: `https://<reference-id>.supabase.co`.
- **Or** click **Connect** (top of the dashboard) — connection examples include this same `https://…supabase.co` URL.

#### **`SUPABASE_SERVICE_ROLE_KEY` (elevated / server key)**

- Open **Project Settings** → **API Keys** (path may be **Settings → API** on older layouts).
- **Publishable key** (`sb_publishable_...`) — safe for websites/apps in the browser. **Do not use this** for the watchlist server.
- **Secret key** (`sb_secret_...`) — **use this.** Copy it into `SUPABASE_SERVICE_ROLE_KEY` in Vercel or `.env`.
- **Legacy:** If you see a **Legacy API keys** tab, you can instead copy **`service_role`** (long JWT). Same purpose as the new secret key.

Treat the secret / `service_role` like a password—never put it in frontend code or public repos. Only server env vars (or local `.env`, gitignored).

You can also set **`SUPABASE_SECRET_KEY`** to the same value if you prefer that name (the server accepts either).

### 4. Add variables to Vercel (or your host)

1. Open your project on [Vercel](https://vercel.com) → **Settings** → **Environment Variables**.
2. Add:

   | Name | Value |
   |------|--------|
   | `SUPABASE_URL` | The `https://xxxxx.supabase.co` URL from step 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | The **Secret** key (`sb_secret_...`) or legacy **service_role** JWT |

3. Enable them for **Production** (and **Preview** if you want preview deployments to sync too).

4. **Redeploy** the latest deployment (Deployments → … → Redeploy), or push a small commit so a new build runs. Env vars are applied at build/runtime for new deployments.

### 5. Add variables for local development (optional)

In the project root, copy `.env.example` to `.env` (or use `server/.env`—the server loads both) and add:

```env
SUPABASE_URL=https://okzxxxxxxxxx.supabase.co
# New UI: paste "Secret key" here. Legacy: paste service_role JWT.
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxx
```

Run `npm start` again. With valid Supabase env vars, `GET /api/config` should return `"hasCloudSync": true`, and lists load/save through `/api/sync/:slug` instead of staying browser-only.

### 6. Verify it works

1. Open your deployed site (or `http://localhost:3000`).
2. Add or import a title, wait a second (sync is debounced).
3. Open the same site in an **incognito / another browser** with the **same** `?p=your-profile` URL—you should see the same titles.
4. **Watch together** uses a fixed slug (default `watch-together`) in the database—both of you can use `?list=shared` after sync is on.

### Troubleshooting

| Problem | What to check |
|---------|----------------|
| `hasCloudSync` stays false | Redeploy after adding env vars; confirm names match `.env.example` (no typos or extra spaces). |
| `500` on `/api/sync/...` | SQL not run, or wrong URL/key; check server logs / Vercel **Functions** logs. |
| Empty list on partner’s phone | Same `?p=` string; partner must use the exact profile slug you use; or use **Watch together** + `?list=shared` with Supabase. |
| Want a new empty database | You can truncate in SQL Editor: `truncate table public.watchlists restart identity;` (destructive). |

---

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
   | `SUPABASE_URL` | (optional) See **Supabase setup** in this README |
   | `SUPABASE_SERVICE_ROLE_KEY` | (optional) `service_role` secret |
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
| `SUPABASE_URL` | (Optional—see **Supabase setup** section above) Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | (Optional) **service_role** secret from Supabase → Settings → API |

Follow the full **Supabase setup (cloud sync)** section in this README first, then paste the two values here. Without them, lists stay **browser-only** and shared links look empty on other devices.

Apply these vars to **Production** (and **Preview** if you use preview URLs).

**Share the site**

1. You bookmark something like `https://yoursite.vercel.app/?p=you` (or use **Copy link** in the header).
2. She uses `https://yoursite.vercel.app/?p=her-name` and **Import** her CSV there.
3. Different `p` → different list. With Supabase, each link keeps working from any device.

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

### Pasting titles (no CSV)
1. Switch to **My list** or **Watch together** first — pasted rows go into the **active** list.
2. Click **Import** → **Paste titles**.
3. Paste names, **one per line**. Optional: several titles on one line separated by **`|`** or **`;`**. Optional year: `Inception (2010)` or `The Bear — 2022`.
4. **Preview import** (or **Ctrl+Enter** / **⌘+Enter** in the box). Default status is **Want to Watch**; you can change it in the preview step.
5. Confirm import. If the server has **TMDB/OMDB** env vars, new rows are **auto-enriched** with posters and ratings (same as after CSV import).

### Custom CSV
Use the **Custom CSV** tab; see the in-app instructions for column names (`title` / `name`, `year`, `type`, `status`, etc.).

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
- Use the **search bar** to find titles by name, genre, or notes (input is **debounced** so the list does not repaint on every keystroke)
- Use the **filter buttons** to show only Movies, Series, or by watch status

### Bulk posters & ratings
In **Settings**, use **Fetch missing posters & ratings** to fill gaps for the whole list. With **server-side** TMDB/OMDB keys, this uses **`POST /api/enrich-batch`** (parallel requests) instead of many slow round-trips from the browser.

### Keyboard Shortcuts
- `Ctrl/Cmd + N`: Add new title
- `Esc`: Close modal
- In **Paste titles** textarea: `Ctrl/Cmd + Enter` runs **Preview import**

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

- **With Supabase configured:** the server reads/writes JSON per profile slug (`?p=`) or the shared list (`?list=shared`); the browser keeps a **cache** in `localStorage` for offline-ish speed.
- **Without Supabase:** everything stays in **localStorage** only (per profile / shared mode keys such as `watchlist_data_v2_<slug>`).

In all cases:

- ✅ Data persists between browser sessions (until you clear site data)
- ⚠️ Without cloud sync, data is **device-specific**
- ⚠️ Clearing browser data for the site removes the local copy (use **Export** / Supabase if you need a backup)

### Export Your Data
Open browser console (F12) and run:
```javascript
// Replace "you" with your profile slug from ?p=
console.log(JSON.stringify(JSON.parse(localStorage.getItem('watchlist_data_v2_you')), null, 2));
```

### Import Data
```javascript
localStorage.setItem('watchlist_data_v2_you', JSON.stringify(yourDataArray));
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
- API proxy for OMDB & TMDB (`/api/omdb`, `/api/tmdb/...`)
- `GET /api/config` — whether server has keys + whether Supabase sync is configured
- `POST /api/enrich-batch` — batch poster/rating enrichment (used by import + bulk fetch when server keys exist)
- Optional Supabase REST sync (`/api/sync/:slug`)

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
