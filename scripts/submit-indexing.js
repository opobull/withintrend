#!/usr/bin/env node
/**
 * submit-indexing.js — sitemap에서 URL 추출 → 인덱싱 상태 확인 → 미인덱싱 URL 제출
 * Usage:
 *   node scripts/submit-indexing.js                # 전체 실행
 *   node scripts/submit-indexing.js --check-only   # 상태 확인만 (제출 안 함)
 *   node scripts/submit-indexing.js --limit 50     # 최대 50건만 확인
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const SITE_URL = 'https://withintrend.org/';
const SITEMAP_URL = 'https://withintrend.org/sitemap.xml';
const CREDS_PATH = path.resolve(__dirname, '../../config/gcloud-ga-credentials.json');
const DATA_DIR = path.resolve(__dirname, '../data');
const LOG_PATH = path.join(DATA_DIR, 'indexing-log.json');
const DAILY_LIMIT = 200;

// ── JWT 생성 ──
function createJWT(creds, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(creds.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

// ── 액세스 토큰 ──
async function getAccessToken(creds, scope) {
  const jwt = createJWT(creds, scope);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Sitemap에서 URL 추출 (중첩 sitemap 지원) ──
async function fetchSitemapUrls(sitemapUrl) {
  const resp = await fetch(sitemapUrl);
  const xml = await resp.text();
  
  // 중첩 sitemap 체크
  const sitemapRefs = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
  if (sitemapRefs.length > 0) {
    const allUrls = [];
    for (const ref of sitemapRefs) {
      const urls = await fetchSitemapUrls(ref);
      allUrls.push(...urls);
    }
    return allUrls;
  }
  
  // 일반 URL 추출
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
}

// ── URL Inspection API ──
async function inspectUrl(token, url) {
  const resp = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inspectionUrl: url,
      siteUrl: SITE_URL
    })
  });
  const data = await resp.json();
  if (data.error) {
    // rate limit이면 잠시 대기
    if (data.error.code === 429) {
      console.log('  ⏳ Rate limited, 10초 대기...');
      await new Promise(r => setTimeout(r, 10000));
      return inspectUrl(token, url);
    }
    throw new Error(`Inspection error for ${url}: ${JSON.stringify(data.error)}`);
  }
  return data;
}

// ── Indexing API로 URL 제출 ──
async function submitUrl(token, url) {
  const resp = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      type: 'URL_UPDATED'
    })
  });
  const data = await resp.json();
  if (data.error) {
    return { url, success: false, error: data.error.message || JSON.stringify(data.error) };
  }
  return { url, success: true, notifyTime: data.urlNotificationMetadata?.latestUpdate?.notifyTime };
}

// ── 오늘 이미 제출한 건수 확인 ──
function getTodaySubmitCount() {
  if (!fs.existsSync(LOG_PATH)) return 0;
  const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  return (log.submissions || []).filter(s => s.date === today).length;
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;

  console.log('🗺️  Sitemap에서 URL 추출 중...');
  const urls = await fetchSitemapUrls(SITEMAP_URL);
  console.log(`📋 총 ${urls.length}개 URL 발견\n`);

  const urlsToCheck = urls.slice(0, Math.min(urls.length, limit));
  
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  
  // URL Inspection은 webmasters scope 사용
  const inspectionToken = await getAccessToken(creds, 'https://www.googleapis.com/auth/webmasters.readonly');

  console.log(`🔍 인덱싱 상태 확인 중 (${urlsToCheck.length}건)...`);
  const indexed = [];
  const notIndexed = [];
  const errors = [];

  for (let i = 0; i < urlsToCheck.length; i++) {
    const url = urlsToCheck[i];
    const shortUrl = url.replace(SITE_URL, '/');
    process.stdout.write(`  [${i + 1}/${urlsToCheck.length}] ${shortUrl} ... `);
    
    try {
      const result = await inspectUrl(inspectionToken, url);
      const indexResult = result.inspectionResult?.indexStatusResult;
      const verdict = indexResult?.verdict || 'UNKNOWN';
      const coverageState = indexResult?.coverageState || 'unknown';
      
      if (verdict === 'PASS') {
        indexed.push({ url, verdict, coverageState });
        console.log('✅ indexed');
      } else {
        notIndexed.push({ url, verdict, coverageState });
        console.log(`❌ ${coverageState}`);
      }
      
      // API rate limit 방지 (1초 간격)
      if (i < urlsToCheck.length - 1) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      errors.push({ url, error: err.message });
      console.log(`⚠️ error`);
    }
  }

  console.log(`\n📊 결과: ✅ ${indexed.length} indexed / ❌ ${notIndexed.length} not indexed / ⚠️ ${errors.length} errors`);

  // 인덱싱 제출
  let submissions = [];
  if (!checkOnly && notIndexed.length > 0) {
    const todayCount = getTodaySubmitCount();
    const remaining = Math.max(0, DAILY_LIMIT - todayCount);
    const toSubmit = notIndexed.slice(0, remaining);

    if (remaining === 0) {
      console.log(`\n⛔ 오늘 제출 한도(${DAILY_LIMIT}건) 소진. 내일 다시 시도하세요.`);
    } else {
      console.log(`\n📤 인덱싱 제출 중 (${toSubmit.length}건, 오늘 잔여: ${remaining}건)...`);
      
      // Indexing API는 별도 scope
      const indexingToken = await getAccessToken(creds, 'https://www.googleapis.com/auth/indexing');
      
      for (let i = 0; i < toSubmit.length; i++) {
        const { url } = toSubmit[i];
        const shortUrl = url.replace(SITE_URL, '/');
        process.stdout.write(`  [${i + 1}/${toSubmit.length}] ${shortUrl} ... `);
        
        const result = await submitUrl(indexingToken, url);
        submissions.push({
          ...result,
          date: new Date().toISOString().slice(0, 10),
          timestamp: new Date().toISOString()
        });
        
        console.log(result.success ? '✅ submitted' : `❌ ${result.error}`);
        
        // rate limit 방지
        if (i < toSubmit.length - 1) await new Promise(r => setTimeout(r, 500));
      }
      
      console.log(`\n✅ 제출 완료: ${submissions.filter(s => s.success).length}/${submissions.length} 성공`);
    }
  } else if (checkOnly) {
    console.log('\n📝 --check-only 모드: 제출 건너뜀');
  } else {
    console.log('\n🎉 모든 URL이 인덱싱 되어 있습니다!');
  }

  // 로그 저장
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  
  let log = { lastRun: null, history: [], submissions: [] };
  if (fs.existsSync(LOG_PATH)) {
    try { log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); } catch {}
  }
  
  log.lastRun = new Date().toISOString();
  log.history.push({
    date: new Date().toISOString(),
    totalUrls: urls.length,
    checked: urlsToCheck.length,
    indexed: indexed.length,
    notIndexed: notIndexed.length,
    errors: errors.length,
    submitted: submissions.length,
    notIndexedUrls: notIndexed.map(n => n.url),
    errorUrls: errors.map(e => ({ url: e.url, error: e.error }))
  });
  log.submissions.push(...submissions);
  
  // history 최근 30건만 유지
  if (log.history.length > 30) log.history = log.history.slice(-30);
  
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`\n💾 로그 저장: ${LOG_PATH}`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
