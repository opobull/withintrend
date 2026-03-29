#!/usr/bin/env node
/**
 * analyze-traffic.js
 * GA4 Data API로 어제(또는 지정 날짜) 페이지별 실제 방문자 트래픽 조회
 * 카테고리별 합산 → data/fitness.json append
 *
 * Usage:
 *   node scripts/analyze-traffic.js              # 기본: 어제
 *   node scripts/analyze-traffic.js --date 2026-03-27
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Config ───
const ROOT = path.resolve(__dirname, '..');
const FITNESS_PATH = path.join(ROOT, 'data', 'fitness.json');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const GA_CREDS_PATH = path.resolve(__dirname, '../../config/gcloud-ga-credentials.json');
const GA_PROPERTY_ID = '522393079';

// ─── Parse args ───
function parseArgs() {
  const args = process.argv.slice(2);
  let dateStr = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      dateStr = args[i + 1];
      i++;
    }
  }
  if (!dateStr) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = d.toISOString().slice(0, 10);
  }
  return dateStr;
}

// ─── GA4 Auth ───
function createJWT(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(creds.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(creds) {
  const jwt = createJWT(creds);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('GA4 token error: ' + JSON.stringify(data));
  return data.access_token;
}

// ─── GA4 API: 페이지별 조회수 ───
async function fetchTrafficGA4(token, dateStr) {
  const resp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: dateStr, endDate: dateStr }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10000
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error('GA4 API error: ' + JSON.stringify(data.error));
  return data.rows || [];
}

// ─── Build post → categories map from frontmatter ───
function buildPostCategoryMap() {
  const map = {};
  if (!fs.existsSync(POSTS_DIR)) return map;
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const catMatch = fm.match(/categories:\s*\[([^\]]*)\]/);
    if (catMatch) {
      const cats = catMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      map[slug] = cats;
    }
  }
  return map;
}

// ─── Filter GA4 rows to posts ───
function filterPosts(rows) {
  const postPattern = /^\/posts\/([^/]+)\/?$/;
  const filtered = [];
  for (const row of rows) {
    const p = row.dimensionValues[0].value;
    const m = p.match(postPattern);
    if (!m) continue;
    const slug = m[1].replace(/\/$/, '');
    const count = parseInt(row.metricValues[0].value, 10) || 0;
    if (count > 0) filtered.push({ slug, count });
  }
  return filtered;
}

// ─── Slugify ───
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Main ───
async function main() {
  const dateStr = parseArgs();
  console.log(`Analyzing traffic for: ${dateStr} (GA4 — real users only)`);

  // 1. Auth
  if (!fs.existsSync(GA_CREDS_PATH)) {
    console.error('ERROR: GA4 credentials not found at', GA_CREDS_PATH);
    process.exit(1);
  }
  const creds = JSON.parse(fs.readFileSync(GA_CREDS_PATH, 'utf8'));
  const token = await getAccessToken(creds);

  // 2. Fetch from GA4
  const rawRows = await fetchTrafficGA4(token, dateStr);
  console.log(`Raw rows from GA4: ${rawRows.length}`);

  // 3. Filter to posts only
  const posts = filterPosts(rawRows);
  console.log(`Post paths after filtering: ${posts.length}`);

  // 4. Build category map
  const postCatMap = buildPostCategoryMap();

  // 5. Aggregate by category
  const categoryStats = {};
  let unmapped = 0;

  for (const { slug, count } of posts) {
    const cats = postCatMap[slug];
    if (!cats || cats.length === 0) {
      unmapped += count;
      continue;
    }
    for (const cat of cats) {
      const key = slugify(cat);
      if (!categoryStats[key]) {
        categoryStats[key] = { posts: new Set(), visits: 0 };
      }
      categoryStats[key].posts.add(slug);
      categoryStats[key].visits += count;
    }
  }

  // 6. Build fitness entry
  const catResult = {};
  for (const [key, stat] of Object.entries(categoryStats)) {
    const postCount = stat.posts.size;
    catResult[key] = {
      posts: postCount,
      visits: stat.visits,
      avg: postCount > 0 ? Math.round((stat.visits / postCount) * 100) / 100 : 0,
    };
  }

  const entry = {
    date: dateStr,
    source: 'ga4',
    totalPostHits: posts.reduce((s, p) => s + p.count, 0),
    unmappedHits: unmapped,
    categories: catResult,
  };

  console.log('\nFitness entry:');
  console.log(JSON.stringify(entry, null, 2));

  // 7. Append to fitness.json
  let fitness = [];
  if (fs.existsSync(FITNESS_PATH)) {
    try {
      fitness = JSON.parse(fs.readFileSync(FITNESS_PATH, 'utf8'));
    } catch { fitness = []; }
  }

  fitness = fitness.filter(e => e.date !== dateStr);
  fitness.push(entry);
  fitness.sort((a, b) => a.date.localeCompare(b.date));

  fs.mkdirSync(path.dirname(FITNESS_PATH), { recursive: true });
  fs.writeFileSync(FITNESS_PATH, JSON.stringify(fitness, null, 2) + '\n');
  console.log(`\nSaved to ${FITNESS_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
