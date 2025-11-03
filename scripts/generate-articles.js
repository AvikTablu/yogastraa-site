// scripts/generate-articles.js
// Run with: node scripts/generate-articles.js
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'https://yogastra-backend-2d084cc0cf9e.herokuapp.com';
const OUT_DIR = path.resolve('public'); // writes into public/
const ARTICLES_DIR = path.join(OUT_DIR, 'knowledge', 'articles');
const TIPS_DIR = path.join(OUT_DIR, 'knowledge', 'tips');

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/** convert simple plain-text content to paragraphs (safe) */
function textToHtml(text) {
    if (!text) return '';
    // split on double newlines for paragraphs
    const parts = String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    return parts.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

async function loadTemplate(nameList) {
    // nameList is array of candidate names; return first that exists
    for (const name of nameList) {
        const p = path.join('templates', name);
        try {
            const txt = await fs.readFile(p, 'utf-8');
            return txt;
        } catch (e) {
            // continue
        }
    }
    throw new Error(`None of the templates found: ${JSON.stringify(nameList)}`);
}

function formatISO(dateStr) {
    try { return new Date(dateStr).toISOString(); } catch (e) { return (new Date()).toISOString(); }
}

function prettyDateISO(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB'); // DD/MM/YYYY style
    } catch (e) { return dateStr; }
}

async function main() {
    console.log('Generating articles & tips...');
    await ensureDir(ARTICLES_DIR);
    await ensureDir(TIPS_DIR);

    // Fetch data
    const articles = Array.isArray(await fetchJson(`${API_BASE}/articles`)) ? await fetchJson(`${API_BASE}/articles`) : [];
    const tips = Array.isArray(await fetchJson(`${API_BASE}/tips`)) ? await fetchJson(`${API_BASE}/tips`) : [];

    // Load templates (handle plural/singular name mismatches)
    const articleTpl = await loadTemplate(['article.html']);
    const listTpl = await loadTemplate(['articles-list.html', 'article-list.html', 'articles-list.tpl.html']);
    const tipsListTpl = await loadTemplate(['tips-list.html', 'tips-list.tpl.html']);

    // Base site values
    const baseUrl = 'https://yogastraa.com';
    const siteImage = `${baseUrl}/assets/yogastraa.jpg`;

    const articlePages = [];

    for (const a of articles) {
        const slug = a.slug || `article-${a.id}`;
        const dir = path.join(ARTICLES_DIR, slug);
        await ensureDir(dir);

        const title = a.title || 'Article';
        const description = (a.content || '').replace(/\s+/g, ' ').slice(0, 150);
        const created = formatISO(a.createdAt || a.updatedAt || new Date().toISOString());
        const modified = formatISO(a.updatedAt || a.createdAt || new Date().toISOString());
        const datePretty = prettyDateISO(a.createdAt || a.updatedAt || new Date().toISOString());
        const urlPathDir = `/knowledge/articles/${slug}/`;
        const urlPathFile = `/knowledge/articles/${slug}.html`;
        const canonicalUrl = `${baseUrl}${urlPathDir}`;

        // keywords: categories + healthConditions names
        const catNames = (Array.isArray(a.categories) ? a.categories.map(c => c.name) : []).filter(Boolean);
        const hcNames = (Array.isArray(a.healthConditions) ? a.healthConditions.map(h => h.name) : []).filter(Boolean);
        const keywords = Array.from(new Set([...catNames, ...hcNames])).join(', ');

        // content safe HTML
        const contentHtml = textToHtml(a.content || '');

        const categoriesStr = catNames.length ? catNames.map(escapeHtml).join(', ') : 'General';

        // populate template placeholders
        const html = articleTpl
            .replaceAll('{{TITLE}}', escapeHtml(title))
            .replaceAll('{{META_DESC}}', escapeHtml(description))
            .replaceAll('{{KEYWORDS}}', escapeHtml(keywords))
            .replaceAll('{{URL}}', canonicalUrl)
            .replaceAll('{{IMAGE}}', siteImage)
            .replaceAll('{{DATE}}', created)
            .replaceAll('{{DATE_MODIFIED}}', modified)
            .replaceAll('{{DATE_PRETTY}}', escapeHtml(datePretty))
            .replaceAll('{{CONTENT}}', contentHtml)
            .replaceAll('{{AUTHOR}}', escapeHtml(a.author || 'Yogastraa Team'))
            .replaceAll('{{CATEGORIES}}', escapeHtml(categoriesStr))
            .replaceAll('{{SLUG}}', escapeHtml(slug));

        // write directory-index version
        await fs.writeFile(path.join(dir, 'index.html'), html, 'utf-8');

        // also write flat file version for compatibility (slug.html)
        await fs.writeFile(path.join(ARTICLES_DIR, `${slug}.html`), html, 'utf-8');

        articlePages.push({ slug, title, urlDir: urlPathDir, urlFile: urlPathFile, date: modified });
        console.log(`Wrote article: ${slug}`);
    }

    // Generate articles list page (server-side generated HTML for SEO)
    const articleRowsHtml = articlePages.map(p => {
        const d = p.date ? p.date.split('T')[0] : '';
        return `<li class="article-item"><a href="${p.urlDir}">${escapeHtml(p.title)}</a> <small class="text-muted">${escapeHtml(d)}</small></li>`;
    }).join('\n');

    const articlesListHtml = listTpl.replaceAll('{{ARTICLE_ROWS}}', articleRowsHtml);
    await fs.writeFile(path.join(ARTICLES_DIR, 'index.html'), articlesListHtml, 'utf-8');
    // also create flat file at /knowledge/articles.html for old links (optional)
    await fs.writeFile(path.join(OUT_DIR, 'knowledge', 'articles.html'), articlesListHtml, 'utf-8').catch(() => { });
    console.log('Wrote articles list');

    // Generate tips list page (no individual pages)
    const tipsRowsHtml = tips.map(t => {
        const cat = t.category?.name || '';
        const date = t.createdAt ? (new Date(t.createdAt)).toISOString().split('T')[0] : '';
        return `<li class="tip-item">${escapeHtml(t.content)} <small class="text-muted">(${escapeHtml(cat)})</small> <small class="text-muted ms-2">${escapeHtml(date)}</small></li>`;
    }).join('\n');
    const tipsHtml = tipsListTpl.replaceAll('{{TIP_ROWS}}', tipsRowsHtml);
    await fs.writeFile(path.join(TIPS_DIR, 'index.html'), tipsHtml, 'utf-8');
    await fs.writeFile(path.join(OUT_DIR, 'knowledge', 'tips.html'), tipsHtml, 'utf-8').catch(() => { });
    console.log('Wrote tips list');

    // Sitemap (use article updatedAt when available)
    const urls = [
        { loc: '/', lastmod: new Date().toISOString() },
        { loc: '/contactUs/', lastmod: new Date().toISOString() },
        { loc: '/privacyPolicy/', lastmod: new Date().toISOString() },
        { loc: '/disclaimerPolicy/', lastmod: new Date().toISOString() },
        { loc: '/refundPolicy/', lastmod: new Date().toISOString() },
        { loc: '/termsConditions/', lastmod: new Date().toISOString() },
        { loc: '/knowledge/articles/', lastmod: new Date().toISOString() },
        { loc: '/knowledge/tips/', lastmod: new Date().toISOString() },
    ];

    for (const p of articlePages) {
        const found = articles.find(a => (a.slug || `article-${a.id}`) === p.slug);
        const lastmod = found?.updatedAt ? formatISO(found.updatedAt) : new Date().toISOString();
        urls.push({ loc: p.urlDir, lastmod });
        // also include flat file url
        urls.push({ loc: p.urlFile, lastmod });
    }

    const sitemapEntries = urls.map(u => `<url><loc>${baseUrl}${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n');
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;
    await fs.writeFile(path.join(OUT_DIR, 'sitemap.xml'), sitemap, 'utf-8');
    console.log('Wrote sitemap.xml');

    // robots.txt
    const robots = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
    await fs.writeFile(path.join(OUT_DIR, 'robots.txt'), robots, 'utf-8');
    console.log('Wrote robots.txt');

    // CNAME for GitHub Pages custom domain
    await fs.writeFile(path.join(OUT_DIR, 'CNAME'), 'yogastraa.com\n', 'utf-8');
    console.log('Wrote CNAME');

    console.log('Generation complete.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
