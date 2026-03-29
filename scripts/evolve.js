#!/usr/bin/env node
/**
 * evolve.js
 * 진화 메커니즘: fitness.json 분석 → 카테고리 확장/도태/돌연변이 → 글 생성 → git push
 *
 * Usage:
 *   node scripts/evolve.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const FITNESS_PATH = path.join(DATA_DIR, 'fitness.json');
const CATEGORIES_PATH = path.join(DATA_DIR, 'categories.json');
const EVOLUTION_LOG_PATH = path.join(DATA_DIR, 'evolution-log.json');

// ─── Mutation candidate pool (categories NOT in initial 20) ───
const MUTATION_POOL = [
  { slug: 'science-nature', name: 'Science & Nature', tags: ['science', 'nature', 'biology', 'physics'] },
  { slug: 'crypto-web3', name: 'Crypto & Web3', tags: ['cryptocurrency', 'blockchain', 'web3', 'DeFi'] },
  { slug: 'mental-health', name: 'Mental Health', tags: ['mental health', 'therapy', 'self-care', 'anxiety'] },
  { slug: 'photography', name: 'Photography', tags: ['photography', 'camera', 'photo tips', 'editing'] },
  { slug: 'freelancing', name: 'Freelancing', tags: ['freelance', 'remote work', 'gig economy', 'self-employed'] },
  { slug: 'history', name: 'History', tags: ['history', 'historical events', 'ancient history', 'world history'] },
  { slug: 'art-design', name: 'Art & Design', tags: ['art', 'graphic design', 'illustration', 'creativity'] },
  { slug: 'sustainability', name: 'Sustainability', tags: ['sustainability', 'eco-friendly', 'green living', 'environment'] },
  { slug: 'board-games', name: 'Board Games & Tabletop', tags: ['board games', 'tabletop', 'card games', 'D&D'] },
  { slug: 'space-astronomy', name: 'Space & Astronomy', tags: ['space', 'astronomy', 'NASA', 'planets'] },
  { slug: 'camping-outdoors', name: 'Camping & Outdoors', tags: ['camping', 'hiking', 'outdoor activities', 'nature'] },
  { slug: 'beauty-skincare', name: 'Beauty & Skincare', tags: ['beauty', 'skincare', 'makeup', 'cosmetics'] },
  { slug: 'books-reading', name: 'Books & Reading', tags: ['books', 'reading', 'book reviews', 'literature'] },
  { slug: 'productivity', name: 'Productivity & Organization', tags: ['productivity', 'organization', 'time management', 'habits'] },
  { slug: 'food-culture', name: 'Food Culture & Trends', tags: ['food trends', 'food culture', 'restaurants', 'culinary'] },
];

// ─── Helpers ───
function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main ───
async function main() {
  console.log('=== Evolution Cycle ===');
  console.log(`Date: ${today()}`);

  // 1. Load data
  const fitness = loadJSON(FITNESS_PATH) || [];
  const categories = loadJSON(CATEGORIES_PATH);
  const evolutionLog = loadJSON(EVOLUTION_LOG_PATH) || [];

  if (!categories) {
    console.error('ERROR: categories.json not found. Run data initialization first.');
    process.exit(1);
  }

  // 2. Analyze last 2 weeks of fitness data
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const cutoff = twoWeeksAgo.toISOString().slice(0, 10);

  const recentData = fitness.filter(e => e.date >= cutoff);
  console.log(`Fitness entries in last 2 weeks: ${recentData.length}`);

  // GA4 기반 실제 방문자 데이터로 진화 판단
  // 최소 7일 GA4 데이터 + 총 방문 10건 이상이어야 진화 모드 진입
  const ga4Data = recentData.filter(e => e.source === 'ga4');
  const totalRealVisits = ga4Data.reduce((s, e) => s + (e.totalPostHits || 0), 0);
  
  if (ga4Data.length < 7 || totalRealVisits < 10) {
    console.log(`시드 모드 유지: GA4 데이터 ${ga4Data.length}일 (최소 7일), 실제 방문 ${totalRealVisits}건 (최소 10건)`);
    console.log('조건 미달 → 카테고리 균등 배분으로 글 생성 (진화 판단 생략)');
    // 시드 모드: 진화 판단 없이 균등 생성하도록 결과 반환
    const result = {
      date: today(),
      mode: 'seed',
      reason: `GA4 data: ${ga4Data.length} days, ${totalRealVisits} real visits (need 7d + 10 visits)`,
      actions: [],
    };
    const evolutionLog = loadJSON(EVOLUTION_LOG_PATH) || [];
    evolutionLog.push(result);
    saveJSON(EVOLUTION_LOG_PATH, evolutionLog);
    console.log('\nSeed mode logged. Daily evolve task will use uniform distribution.');
    return;
  }

  console.log(`진화 모드: GA4 ${ga4Data.length}일, 실제 방문 ${totalRealVisits}건`);

  if (recentData.length === 0) {
    console.log('No fitness data in last 2 weeks.');
    return;
  }

  // 3. Aggregate category performance over 2 weeks
  const categoryPerf = {}; // slug → { totalVisits, totalPosts, days }
  for (const entry of recentData) {
    for (const [catSlug, stats] of Object.entries(entry.categories || {})) {
      if (!categoryPerf[catSlug]) {
        categoryPerf[catSlug] = { totalVisits: 0, totalPosts: 0, days: 0 };
      }
      categoryPerf[catSlug].totalVisits += stats.visits;
      categoryPerf[catSlug].totalPosts = Math.max(categoryPerf[catSlug].totalPosts, stats.posts);
      categoryPerf[catSlug].days++;
    }
  }

  // Calculate average daily visits per post for each category
  const perfScores = [];
  for (const [slug, perf] of Object.entries(categoryPerf)) {
    const avgDailyVisits = perf.days > 0 ? perf.totalVisits / perf.days : 0;
    const avgPerPost = perf.totalPosts > 0 ? avgDailyVisits / perf.totalPosts : 0;
    perfScores.push({ slug, avgDailyVisits, avgPerPost, totalVisits: perf.totalVisits, posts: perf.totalPosts });
  }

  // Sort by avgPerPost descending
  perfScores.sort((a, b) => b.avgPerPost - a.avgPerPost);

  console.log('\nCategory Performance (sorted):');
  for (const s of perfScores) {
    console.log(`  ${s.slug}: ${s.avgPerPost.toFixed(2)} avg/post/day (${s.totalVisits} total, ${s.posts} posts)`);
  }

  // 4. Selection
  const totalCats = perfScores.length;
  const expandCount = Math.max(1, Math.ceil(totalCats * 0.3));
  const dormantCount = Math.max(1, Math.ceil(totalCats * 0.3));

  const expandSlugs = perfScores.slice(0, expandCount).map(s => s.slug);
  const dormantSlugs = perfScores.slice(-dormantCount).map(s => s.slug);
  const maintainSlugs = perfScores
    .slice(expandCount, totalCats - dormantCount)
    .map(s => s.slug);

  console.log(`\nExpand (top 30%, +10 posts): ${expandSlugs.join(', ')}`);
  console.log(`Maintain (middle 40%): ${maintainSlugs.join(', ')}`);
  console.log(`Dormant (bottom 30%): ${dormantSlugs.join(', ')}`);

  // 5. Update categories.json
  for (const cat of categories) {
    if (expandSlugs.includes(cat.slug)) {
      cat.status = 'expanding';
    } else if (dormantSlugs.includes(cat.slug)) {
      cat.status = 'dormant';
    } else if (maintainSlugs.includes(cat.slug)) {
      cat.status = 'active';
    }
    // Categories not in fitness data keep their current status
  }

  // 6. Mutation (10% chance)
  let mutationCat = null;
  if (Math.random() < 0.10) {
    const existingSlugs = new Set(categories.map(c => c.slug));
    const candidates = MUTATION_POOL.filter(c => !existingSlugs.has(c.slug));
    if (candidates.length > 0) {
      mutationCat = candidates[Math.floor(Math.random() * candidates.length)];
      categories.push({
        slug: mutationCat.slug,
        name: mutationCat.name,
        tags: mutationCat.tags,
        status: 'mutant',
        addedDate: today(),
      });
      console.log(`\n🧬 Mutation! New category: ${mutationCat.name}`);
    }
  } else {
    console.log('\nNo mutation this cycle (90% probability).');
  }

  saveJSON(CATEGORIES_PATH, categories);
  console.log('Updated categories.json');

  // 7. Generate posts for expanding categories
  console.log('\n=== Generating Posts ===');
  for (const slug of expandSlugs) {
    console.log(`\nGenerating 10 posts for expanding category: ${slug}`);
    try {
      execSync(`node ${path.join(__dirname, 'generate-posts.js')} --category "${slug}" --count 10`, {
        stdio: 'inherit',
        cwd: ROOT,
      });
    } catch (err) {
      console.error(`  Error generating posts for ${slug}: ${err.message}`);
    }
  }

  // Generate 5 posts for mutation category
  if (mutationCat) {
    console.log(`\nGenerating 5 posts for mutant category: ${mutationCat.slug}`);
    try {
      execSync(`node ${path.join(__dirname, 'generate-posts.js')} --category "${mutationCat.slug}" --count 5`, {
        stdio: 'inherit',
        cwd: ROOT,
      });
    } catch (err) {
      console.error(`  Error generating mutation posts: ${err.message}`);
    }
  }

  // 8. Crossover: top 2 categories hybrid
  if (expandSlugs.length >= 2) {
    console.log(`\n🔀 Crossover: ${expandSlugs[0]} + ${expandSlugs[1]} hybrid topics`);
    // Crossover posts would need special topic generation — for now, generate extra from top category
    try {
      execSync(`node ${path.join(__dirname, 'generate-posts.js')} --category "${expandSlugs[0]}" --count 5`, {
        stdio: 'inherit',
        cwd: ROOT,
      });
    } catch (err) {
      console.error(`  Error generating crossover posts: ${err.message}`);
    }
  }

  // 9. Log evolution entry
  const logEntry = {
    date: today(),
    generation: evolutionLog.length + 1,
    fitnessDataDays: recentData.length,
    expand: expandSlugs,
    maintain: maintainSlugs,
    dormant: dormantSlugs,
    mutation: mutationCat ? mutationCat.slug : null,
    scores: perfScores.map(s => ({ slug: s.slug, avgPerPost: Math.round(s.avgPerPost * 100) / 100 })),
  };
  evolutionLog.push(logEntry);
  saveJSON(EVOLUTION_LOG_PATH, evolutionLog);
  console.log('\nEvolution log updated.');

  // 10. Git commit + push
  console.log('\n=== Git Commit & Push ===');
  try {
    execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
    execSync(`git commit -m "Evolution gen ${logEntry.generation}: expand [${expandSlugs.join(', ')}], dormant [${dormantSlugs.join(', ')}]${mutationCat ? `, mutation: ${mutationCat.slug}` : ''}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
    execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
    console.log('Git push complete!');
  } catch (err) {
    console.error(`Git error: ${err.message}`);
  }

  console.log('\n=== Evolution Cycle Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
