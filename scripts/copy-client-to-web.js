/**
 * Copies client/ → web/ for production builds.
 *
 * Vercel automatically serves files from a root-level `public/` folder via the CDN,
 * which bypasses Express — so private-site middleware never runs for HTML/JS/CSS.
 * Output to `web/` instead; Express serves it when VERCEL=1 so all requests hit the gate.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'client');
const dest = path.join(root, 'web');

function rmDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) rmDir(p);
        else fs.unlinkSync(p);
    }
    fs.rmdirSync(dir);
}

function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        const s = path.join(from, e.name);
        const d = path.join(to, e.name);
        if (e.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

if (!fs.existsSync(src)) {
    console.error('copy-client-to-web: missing client/ folder');
    process.exit(1);
}

if (fs.existsSync(dest)) rmDir(dest);
copyDir(src, dest);
console.log('copy-client-to-web: client/ → web/');
