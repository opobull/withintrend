#!/usr/bin/env node
/**
 * analyze-traffic.js
 * Cloudflare GraphQL Analytics API로 어제(또는 지정 날짜) 페이지별 트래픽 조회
 * 봇 필터링 후 포스트 경로만 카운트, 카테고리별 합산 → data/fitness.json append
 *
 * Usage:
 *   node scripts/analyze-traffic.js              # 기본: 어제
 *   node scripts/analyze-traffic.js --date 2026-03-27
 */

const fs = require('fs');
const path = require('path');

// ─── Config ───
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(__dirname, '../../config/.env');
const FITNESS_PATH = path.join(ROOT, 'data', 'fitness.json');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');

// Load .env manually (no dotenv dependency)
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv(ENV_PATH);

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ZONE_ID = process.env.CF_ZONE_ID || '4a1801ca2da39344c72bda4c7cf6f6ae';

if (!CF_API_TOKEN) {
  console.error('ERROR: CF_API_TOKEN not found in env or config/.env');
  process.exit(1);
}

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
    // Yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = d.toISOString().slice(0, 10);
  }
  return dateStr;
}

// ─── Build post → categories map from frontmatter ───
function buildPostCategoryMap() {
  const map = {}; // slug → [categories]
  if (!fs.existsSync(POSTS_DIR)) return map;
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    // Parse categories from YAML
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

// ─── Cloudflare GraphQL query ───
async function fetchTraffic(dateStr) {
  const datetimeGeq = `${dateStr}T00:00:00Z`;
  const datetimeLt = `${dateStr}T23:59:59Z`;

  const query = `
    query {
      viewer {
        zones(filter: { zoneTag: "${CF_ZONE_ID}" }) {
          httpRequestsAdaptiveGroups(
            filter: {
              datetime_geq: "${datetimeGeq}"
              datetime_lt: "${datetimeLt}"
            }
            limit: 9999
            orderBy: [count_DESC]
          ) {
            count
            dimensions {
              clientRequestPath
            }
          }
        }
      }
    }
  `;

  const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Cloudflare API error ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.viewer.zones[0].httpRequestsAdaptiveGroups || [];
}

// ─── Filter bot/non-post paths ───
function filterPosts(groups) {
  const excludePatterns = [
    /^\/$/,                    // homepage
    /robots\.txt/i,
    /sitemap\.xml/i,
    /favicon\.ico/i,
    /\.css$/i,
    /\.js$/i,
    /\.xml$/i,
    /^\/tags\//i,
    /^\/categories\//i,
  ];

  const postPattern = /^\/posts\/([^/]+)\/?$/;

  const filtered = [];
  for (const g of groups) {
    const p = g.dimensions.clientRequestPath;
    if (excludePatterns.some(re => re.test(p))) continue;
    const m = p.match(postPattern);
    if (!m) continue;
    // Extract slug (remove trailing slash)
    const slug = m[1].replace(/\/$/, '');
    filtered.push({ slug, count: g.count });
  }
  return filtered;
}

// ─── Slugify category name for consistent keys ───
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
  console.log(`Analyzing traffic for: ${dateStr}`);

  // 1. Fetch from Cloudflare
  const rawGroups = await fetchTraffic(dateStr);
  console.log(`Raw groups from API: ${rawGroups.length}`);

  // 2. Filter to posts only
  const posts = filterPosts(rawGroups);
  console.log(`Post paths after filtering: ${posts.length}`);

  // 3. Build category map
  const postCatMap = buildPostCategoryMap();

  // 4. Aggregate by category
  const categoryStats = {}; // slug → { posts: Set, visits: number }
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

  // 5. Build fitness entry
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
    totalPostHits: posts.reduce((s, p) => s + p.count, 0),
    unmappedHits: unmapped,
    categories: catResult,
  };

  console.log('\nFitness entry:');
  console.log(JSON.stringify(entry, null, 2));

  // 6. Append to fitness.json
  let fitness = [];
  if (fs.existsSync(FITNESS_PATH)) {
    try {
      fitness = JSON.parse(fs.readFileSync(FITNESS_PATH, 'utf8'));
    } catch { fitness = []; }
  }

  // Remove existing entry for same date (idempotent)
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
