#!/usr/bin/env node
/**
 * search-console.js — Google Search Console API로 검색 성능 조회
 * Usage:
 *   node scripts/search-console.js              # 최근 7일
 *   node scripts/search-console.js --days 30    # 최근 30일
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE_URL = 'sc-domain:withintrend.org';
const CREDS_PATH = path.resolve(__dirname, '../../config/gcloud-ga-credentials.json');
const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_PATH = path.join(DATA_DIR, 'search-performance.json');

// ── JWT 생성 ──
function createJWT(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(creds.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

// ── 액세스 토큰 ──
async function getAccessToken(creds) {
  const jwt = createJWT(creds);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Search Analytics Query ──
async function querySearchAnalytics(token, startDate, endDate, dimension) {
  const siteEncoded = encodeURIComponent(SITE_URL);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${siteEncoded}/searchAnalytics/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: [dimension],
      rowLimit: 100
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1]) : 7;

  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - days + 1);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  console.log(`🔍 Search Console Report: ${startDate} ~ ${endDate} (${days}일)\n`);

  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const token = await getAccessToken(creds);

  // 쿼리별 성능
  console.log('📝 검색 쿼리 (Top 30):');
  console.log('─'.repeat(90));
  console.log(`${'Query'.padEnd(40)} ${'Clicks'.padStart(8)} ${'Impr'.padStart(8)} ${'CTR'.padStart(8)} ${'Pos'.padStart(8)}`);
  console.log('─'.repeat(90));

  const queryData = await querySearchAnalytics(token, startDate, endDate, 'query');
  const queryRows = (queryData.rows || []).slice(0, 30);
  for (const row of queryRows) {
    const q = row.keys[0].length > 38 ? row.keys[0].slice(0, 35) + '...' : row.keys[0];
    console.log(`${q.padEnd(40)} ${String(row.clicks).padStart(8)} ${String(row.impressions).padStart(8)} ${(row.ctr * 100).toFixed(1).padStart(7)}% ${row.position.toFixed(1).padStart(8)}`);
  }

  // 페이지별 성능
  console.log('\n📄 페이지별 성능 (Top 30):');
  console.log('─'.repeat(90));
  console.log(`${'Page'.padEnd(50)} ${'Clicks'.padStart(8)} ${'Impr'.padStart(8)} ${'CTR'.padStart(8)} ${'Pos'.padStart(8)}`);
  console.log('─'.repeat(90));

  const pageData = await querySearchAnalytics(token, startDate, endDate, 'page');
  const pageRows = (pageData.rows || []).slice(0, 30);
  for (const row of pageRows) {
    const p = row.keys[0].replace(SITE_URL, '/');
    const pDisplay = p.length > 48 ? p.slice(0, 45) + '...' : p;
    console.log(`${pDisplay.padEnd(50)} ${String(row.clicks).padStart(8)} ${String(row.impressions).padStart(8)} ${(row.ctr * 100).toFixed(1).padStart(7)}% ${row.position.toFixed(1).padStart(8)}`);
  }

  // JSON 저장
  const result = {
    fetchedAt: new Date().toISOString(),
    period: { startDate, endDate, days },
    queries: (queryData.rows || []).map(r => ({
      query: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, position: r.position
    })),
    pages: (pageData.rows || []).map(r => ({
      page: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, position: r.position
    }))
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\n💾 저장: ${OUTPUT_PATH}`);
  console.log(`📊 총 쿼리: ${result.queries.length}개, 페이지: ${result.pages.length}개`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
