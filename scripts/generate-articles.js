// scripts/generate-articles.js
// Usage: node scripts/generate-articles.js
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch'; // if Node <18 install node-fetch; else use global fetch

const API = 'https://yogastra-backend-2d084cc0cf9e.herokuapp.com/articles';
const OUT_DIR = path.resolve('public', 'knowledge', 'articles'); // adjust if your public folder is different
const TEMPLATE_PATH = path.resolve('templates', 'article-template.html');

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

function safeText(s) {
    if (!s) return '';
    return s.replace(/\r/g, '').replace(/\n/g, '<br/>');
}

function createMetaDesc(content) {
    if (!content) return 'Yogastraa — yoga articles and guidance.';
    const plain = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return plain.length > 160 ? plain.slice(0, 157) + '...' : plain;
}

function keywordsFrom(article) {
    const keys = [];
    if (article.categories) article.categories.forEach(c => keys.push(c.name));
    if (article.healthConditions) {
        article.healthConditions.forEach(h => keys.push(h.name));
    }
    // plus some brand terms
    keys.push('Yogastraa', 'AI yoga', 'yoga tips');
    return Array.from(new Set(keys)).join(', ');
}

async function main() {
    console.log('Starting generation...');
    await ensureDir(OUT_DIR);
    const tplRaw = await fs.readFile(TEMPLATE_PATH, 'utf8');

    console.log('Fetching articles from API...');
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed fetching articles: ' + res.status);
    const data = await res.json();

    const siteRoot = 'https://yogastraa.com';
    const pages = [
        `${siteRoot}/`,
        `${siteRoot}/knowledge/articles.html`,
        `${siteRoot}/knowledge/tips.html`
    ];

    for (const a of data) {
        const slug = a.slug || `article-${a.id}`;
        const outPath = path.join(OUT_DIR, `${slug}.html`);
        const url = `${siteRoot}/knowledge/articles/${slug}.html`;
        const date = a.createdAt || new Date().toISOString();
        const dateMod = a.updatedAt || date;
        const image = `${siteRoot}/assets/yogastraa.jpg`; // replacement image if no article image
        const metaDesc = createMetaDesc(a.content);
        const keywords = keywordsFrom(a);

        const html = tplRaw
            .replaceAll('{{TITLE}}', escapeHtml(a.title))
            .replaceAll('{{META_DESC}}', escapeHtml(metaDesc))
            .replaceAll('{{KEYWORDS}}', escapeHtml(keywords))
            .replaceAll('{{URL}}', url)
            .replaceAll('{{IMAGE}}', image)
            .replaceAll('{{DATE}}', date)
            .replaceAll('{{DATE_MODIFIED}}', dateMod)
            .replaceAll('{{DATE_PRETTY}}', new Date(date).toLocaleDateString())
            .replaceAll('{{AUTHOR}}', escapeHtml(a.author || 'Yogastraa Team'))
            .replaceAll('{{CONTENT}}', a.content) // assume content is HTML; if plain text wrap in <p>
            .replaceAll('{{CATEGORIES}}', (a.categories || []).map(c => c.name).join(', '));

        await fs.writeFile(outPath, html, 'utf8');
        console.log('Wrote', outPath);
        pages.push(url);
    }

    // Generate sitemap.xml
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages.map(u => `
    <url>
      <loc>${u}</loc>
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>`).join('\n')}
  </urlset>`;
    await fs.writeFile(path.resolve('public', 'sitemap.xml'), sitemap, 'utf8');
    console.log('Wrote sitemap.xml');
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

main().catch(err => { console.error(err); process.exit(1); });
