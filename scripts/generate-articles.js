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
    const parts = String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    return parts.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

async function loadTemplate(nameList) {
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

function excerptText(text, max = 220) {
    if (!text) return '';
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const truncated = t.slice(0, max);
    return truncated.replace(/\s+\S*$/, '') + '...';
}

function youtubeIdFromUrl(url) {
    if (!url) return null;
    // handle common youtube URL formats
    const m = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
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

        const catNames = (Array.isArray(a.categories) ? a.categories.map(c => c.name) : []).filter(Boolean);
        const hcNames = (Array.isArray(a.healthConditions) ? a.healthConditions.map(h => h.name) : []).filter(Boolean);
        const keywords = Array.from(new Set([...catNames, ...hcNames])).join(', ');

        const contentHtml = textToHtml(a.content || '');
        const categoriesStr = catNames.length ? catNames.map(escapeHtml).join(', ') : 'General';

        // IMAGES: prepare carousel HTML (if available)
        const imgs = Array.isArray(a.images) ? a.images : [];
        let imagesCarouselHtml = '';
        if (imgs.length === 1) {
            // single image: simple responsive image block
            imagesCarouselHtml = `<div class="mb-3 article-carousel"><img src="${escapeHtml(imgs[0].url)}" alt="${escapeHtml(title)}" class="img-fluid rounded" /></div>`;
        } else if (imgs.length > 1) {
            // bootstrap carousel (unique id per slug)
            const cid = `carousel-${slug.replace(/[^a-z0-9_-]/gi, '')}`;
            const indicators = imgs.map((im, idx) => `<button type="button" data-bs-target="#${cid}" data-bs-slide-to="${idx}" ${idx === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Slide ${idx + 1}"></button>`).join('\n');
            const items = imgs.map((im, idx) => `<div class="carousel-item ${idx === 0 ? 'active' : ''}"><img src="${escapeHtml(im.url)}" class="d-block w-100" alt="${escapeHtml(title)}"></div>`).join('\n');
            imagesCarouselHtml = `
<div id="${cid}" class="carousel slide mb-3 article-carousel" data-bs-ride="carousel">
  <div class="carousel-indicators">
    ${indicators}
  </div>
  <div class="carousel-inner">
    ${items}
  </div>
  <button class="carousel-control-prev" type="button" data-bs-target="#${cid}" data-bs-slide="prev">
    <span class="carousel-control-prev-icon" aria-hidden="true"></span>
    <span class="visually-hidden">Previous</span>
  </button>
  <button class="carousel-control-next" type="button" data-bs-target="#${cid}" data-bs-slide="next">
    <span class="carousel-control-next-icon" aria-hidden="true"></span>
    <span class="visually-hidden">Next</span>
  </button>
</div>`;
        }

        // VIDEO: prepare YouTube embed (if available)
        const videoId = youtubeIdFromUrl(a.videoUrl);
        let videoEmbedHtml = '';
        if (videoId) {
            // responsive embed using bootstrap ratio
            videoEmbedHtml = `
<div class="article-video ratio ratio-16x9">
  <iframe src="https://www.youtube.com/embed/${escapeHtml(videoId)}" title="${escapeHtml(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>`;
        }

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
            .replaceAll('{{SLUG}}', escapeHtml(slug))
            // new placeholders for images & video
            .replaceAll('{{IMAGES_CAROUSEL}}', imagesCarouselHtml)
            .replaceAll('{{VIDEO_EMBED}}', videoEmbedHtml);

        // write directory-index version
        await fs.writeFile(path.join(dir, 'index.html'), html, 'utf-8');

        // also write flat file version for compatibility (slug.html)
        await fs.writeFile(path.join(ARTICLES_DIR, `${slug}.html`), html, 'utf-8');

        // firstImage used by articles list
        const firstImage = imgs.length ? imgs[0].url : '';

        articlePages.push({ slug, title, urlDir: urlPathDir, urlFile: urlPathFile, date: modified, firstImage, foundData: a });
        console.log(`Wrote article: ${slug}`);
    }

    // --------------------------
    // Generate articles list page: produce card grid HTML (server-rendered)
    // --------------------------
    const articleRowsHtml = articlePages.map(p => {
        const found = articles.find(a => (a.slug || `article-${a.id}`) === p.slug) || {};
        const datePretty = found.createdAt ? prettyDateISO(found.createdAt) : '';
        const excerpt = excerptText(found.content || '', 240);
        const badges = (Array.isArray(found.categories) ? found.categories : []).map(c => `<span class="badge rounded-pill bg-secondary me-1 mb-1">${escapeHtml(c.name)}</span>`).join('');
        const author = escapeHtml(found.author || 'Yogastraa Team');
        const firstImg = (Array.isArray(found.images) && found.images.length) ? found.images[0].url : '';

        const imgHtml = firstImg ? `<img src="${escapeHtml(firstImg)}" alt="${escapeHtml(p.title)}" class="card-img-top">` : '';

        return `
  <div class="col-12 col-md-6 col-lg-4">
    <div class="card h-100">
      ${imgHtml}
      <div class="card-body d-flex flex-column">
        <h5 class="card-title">${escapeHtml(p.title)}</h5>
        <p class="card-text text-muted small fst-italic">By ${author} · ${escapeHtml(datePretty)}</p>
        <p class="card-text flex-grow-1">${escapeHtml(excerpt)}</p>
        ${badges ? `<div class="d-flex flex-wrap gap-1 mt-1">${badges}</div>` : ''}
        <a href="${p.urlDir}" class="btn btn-sm btn-primary mt-3"><b>Read article</b></a>
      </div>
    </div>
  </div>
        `;
    }).join('\n');

    const articlesListHtml = listTpl.replaceAll('{{ARTICLE_ROWS}}', articleRowsHtml);
    await fs.writeFile(path.join(ARTICLES_DIR, 'index.html'), articlesListHtml, 'utf-8');
    await fs.writeFile(path.join(OUT_DIR, 'knowledge', 'articles.html'), articlesListHtml, 'utf-8').catch(() => { });
    console.log('Wrote articles list');

    // --------------------------
    // Generate tips list page (server-rendered list-group items)
    // --------------------------
    const tipRowsHtml = (tips || []).map(t => {
        const cat = t.category?.name || '';
        const datePretty = t.createdAt ? prettyDateISO(t.createdAt) : '';
        // create a list-group-item element (server-rendered) — includes badge + date
        return `
  <div class="list-group-item d-flex justify-content-between align-items-start">
    <div>
      <div class="mb-1">${escapeHtml(t.content)}</div>
      ${cat ? `<small class="text-muted">${escapeHtml(cat)}</small>` : ''}
    </div>
    <small class="text-muted ms-3">${escapeHtml(datePretty)}</small>
  </div>`;
    }).join('\n');

    const tipsHtml = tipsListTpl.replaceAll('{{TIP_ROWS}}', tipRowsHtml);
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
