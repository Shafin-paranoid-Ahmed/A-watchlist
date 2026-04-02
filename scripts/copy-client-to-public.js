/**
 * Copies client/ → public/ so Vercel can serve static assets from public/
 * (express.static is ignored on Vercel — see Vercel Express docs)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'client');
const dest = path.join(root, 'public');

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
    console.error('copy-client-to-public: missing client/ folder');
    process.exit(1);
}

if (fs.existsSync(dest)) rmDir(dest);
copyDir(src, dest);
console.log('copy-client-to-public: client/ → public/');
