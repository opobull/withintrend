#!/usr/bin/env node
/**
 * rank-compare.js — 저장된 랭크 베이스라인과 현재 Search Console 데이터 비교
 * Usage:
 *   node scripts/rank-compare.js                              # 최신 baseline 자동 선택
 *   node scripts/rank-compare.js --baseline 2026-04-23        # 특정 날짜 baseline 비교
 *   node scripts/rank-compare.js --fetch                      # SC 최신 30일 가져온 후 비교
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.resolve(__dirname, '../data');
const PERF_PATH = path.join(DATA_DIR, 'search-performance.json');

function findLatestBaseline() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^rank-baseline-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  files.sort().reverse();
  return files[0] || null;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--fetch')) {
    console.log('Fetching latest SC data (30 days)...');
    execSync('node ' + path.join(__dirname, 'search-console.js') + ' --days 30', { stdio: 'inherit' });
  }

  const baselineIdx = args.indexOf('--baseline');
  let baselineFile;
  if (baselineIdx !== -1) {
    baselineFile = 'rank-baseline-' + args[baselineIdx + 1] + '.json';
  } else {
    baselineFile = findLatestBaseline();
    if (!baselineFile) {
      console.error('No baseline found. Expected: data/rank-baseline-YYYY-MM-DD.json');
      process.exit(1);
    }
  }

  const baselinePath = path.join(DATA_DIR, baselineFile);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const current = JSON.parse(fs.readFileSync(PERF_PATH, 'utf8'));

  console.log(`\nBaseline: ${baselineFile} (${baseline.period.startDate} ~ ${baseline.period.endDate})`);
  console.log(`Current:  ${current.period.startDate} ~ ${current.period.endDate}\n`);

  console.log('Slug'.padEnd(45) + 'Impr'.padStart(10) + 'Clicks'.padStart(10) + 'Pos'.padStart(10) + '  Δ');
  console.log('─'.repeat(85));

  const rows = [];
  for (const [slug, base] of Object.entries(baseline.baseline)) {
    const curPage = current.pages.find(p => p.page.includes('/posts/' + slug + '/'));
    const cur = curPage ? {
      position: curPage.position,
      impressions: curPage.impressions,
      clicks: curPage.clicks,
      ctr: curPage.ctr,
    } : null;

    rows.push({ slug, base, cur });
  }

  // Sort: improved ranks first
  rows.sort((a, b) => {
    if (!a.cur || !b.cur) return a.cur ? -1 : 1;
    if (!a.base || !b.base) return 0;
    return (a.cur.position - a.base.position) - (b.cur.position - b.base.position);
  });

  for (const { slug, base, cur } of rows) {
    const slugDisp = slug.length > 43 ? slug.slice(0, 40) + '...' : slug;
    if (!cur) {
      console.log(slugDisp.padEnd(45) + '—'.padStart(10) + '—'.padStart(10) + '—'.padStart(10) + '  (no data)');
      continue;
    }
    const imprStr = String(cur.impressions).padStart(10);
    const clickStr = String(cur.clicks).padStart(10);
    const posStr = cur.position.toFixed(1).padStart(10);
    let delta = '';
    if (base && base.position) {
      const diff = cur.position - base.position;
      if (diff < -0.5) delta = `  ↑ ${(-diff).toFixed(1)}`;
      else if (diff > 0.5) delta = `  ↓ ${diff.toFixed(1)}`;
      else delta = '  =';
    }
    console.log(slugDisp.padEnd(45) + imprStr + clickStr + posStr + delta);
  }

  console.log('\n(pos ↑ = rank improved; lower number = better position)');
}

main();
