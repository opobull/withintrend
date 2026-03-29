#!/usr/bin/env node
/**
 * ga4-traffic.js — GA4 Data API로 실제 방문자 조회
 * Usage:
 *   node scripts/ga4-traffic.js              # 최근 7일
 *   node scripts/ga4-traffic.js --days 30    # 최근 30일
 *   node scripts/ga4-traffic.js --date 2026-03-28  # 특정일
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GA_PROPERTY_ID = '522393079';
const CREDS_PATH = path.resolve(__dirname, '../../config/gcloud-ga-credentials.json');

// ── JWT 생성 ──
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

// ── GA4 리포트 ──
async function runReport(token, startDate, endDate) {
  const resp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'activeUsers' },
        { name: 'sessions' }
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 50
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

async function runSummary(token, startDate, endDate) {
  const resp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' }
      ]
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

async function runByCountry(token, startDate, endDate) {
  const resp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

async function runBySource(token, startDate, endDate) {
  const resp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  let startDate, endDate;

  const dateIdx = args.indexOf('--date');
  const daysIdx = args.indexOf('--days');

  if (dateIdx !== -1) {
    startDate = endDate = args[dateIdx + 1];
  } else {
    const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1]) : 7;
    const end = new Date(); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(start.getDate() - days + 1);
    startDate = start.toISOString().slice(0, 10);
    endDate = end.toISOString().slice(0, 10);
  }

  console.log(`📊 GA4 Traffic Report: ${startDate} ~ ${endDate}\n`);

  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const token = await getAccessToken(creds);

  // Summary
  const summary = await runSummary(token, startDate, endDate);
  const sm = summary.rows?.[0]?.metricValues || [];
  console.log(`👤 활성 사용자: ${sm[0]?.value || 0}`);
  console.log(`📱 세션: ${sm[1]?.value || 0}`);
  console.log(`👁️ 페이지뷰: ${sm[2]?.value || 0}`);
  console.log(`⏱️ 평균 세션: ${Math.round(parseFloat(sm[3]?.value || 0))}초`);

  // Country
  console.log('\n🌍 국가별 사용자:');
  const countries = await runByCountry(token, startDate, endDate);
  for (const row of (countries.rows || [])) {
    console.log(`  ${row.dimensionValues[0].value}: ${row.metricValues[0].value}명`);
  }

  // Source
  console.log('\n📡 트래픽 소스:');
  const sources = await runBySource(token, startDate, endDate);
  for (const row of (sources.rows || [])) {
    console.log(`  ${row.dimensionValues[0].value}: ${row.metricValues[0].value} 세션 (${row.metricValues[1].value}명)`);
  }

  // Top pages
  console.log('\n📄 인기 페이지 (Top 20):');
  const pages = await runReport(token, startDate, endDate);
  for (const row of (pages.rows || []).slice(0, 20)) {
    const path = row.dimensionValues[0].value;
    const views = row.metricValues[0].value;
    const users = row.metricValues[1].value;
    console.log(`  ${views} views (${users} users) — ${path}`);
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
