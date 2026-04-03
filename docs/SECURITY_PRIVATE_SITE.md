# Private site mode (password gate)

## What it does

If you set `PRIVATE_SITE_PASSWORD` on the server (e.g. Vercel environment variables):

1. Visitors without a session cookie are redirected to `/gate.html`.
2. They enter the shared password once; the server sets an **HTTP-only** cookie (about 30 days).
3. Without that cookie, all other `/api/*` routes return **401** (except `/api/site-auth/*` and `/api/config`).
4. Without that cookie, static assets such as `app.js` and `styles.css` return **403**, so the main UI cannot load in the browser.

This is appropriate for a **small trusted group** with one shared password. It is **not** per-user accounts and **not** strict per-device binding (anyone who knows the password can sign in).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_SITE_PASSWORD` | To enable gate | Shared password your group uses at `/gate.html`. |
| `SITE_AUTH_SECRET` | Recommended | Secret used to sign session cookies. If unset, a key is derived from the password (weaker if the password is short). |

After changing env vars on Vercel, **redeploy**.

## Defense in depth (recommended)

- In Vercel: enable **Deployment Protection** or **Password Protection** if your plan supports it.
- Use a **long random** `PRIVATE_SITE_PASSWORD` (password manager).
- Treat `?p=` profile slugs as weak secrets; use long random slugs for sensitive lists.

## Sign out

In the app: **Settings → Sign out of site** clears the cookie and returns to `/gate.html`.

## API (for debugging)

- `GET /api/site-auth/status` — `{ privateSite, ok }` (no cookie required).
- `POST /api/site-auth/login` — body `{ "password": "..." }`, sets cookie.
- `POST /api/site-auth/logout` — clears cookie.

`GET /api/config` includes `"privateSite": true` when the gate is enabled (no cookie required).
