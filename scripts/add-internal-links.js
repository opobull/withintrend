const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'content', 'posts');
const MIN_LINKS = 3;
const MAX_LINKS = 5;

// Parse frontmatter from markdown content
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = match[1];
  
  const titleMatch = fm.match(/^title:\s*"(.+?)"/m);
  const catMatch = fm.match(/^categories:\s*\[(.+?)\]/m);
  
  const title = titleMatch ? titleMatch[1] : null;
  const categories = catMatch 
    ? catMatch[1].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    : [];
  
  return { title, categories };
}

// Get slug from filename (remove .md)
function getSlug(filename) {
  return filename.replace(/\.md$/, '');
}

// Main
const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
console.log(`Found ${files.length} posts`);

// Build post map
const posts = [];
const categoryMap = {}; // category -> [post indices]

for (const file of files) {
  const filepath = path.join(POSTS_DIR, file);
  const content = fs.readFileSync(filepath, 'utf-8');
  const fm = parseFrontmatter(content);
  
  if (!fm || !fm.title) {
    console.log(`SKIP (no frontmatter): ${file}`);
    continue;
  }
  
  const hasSection = content.includes('## You Might Also Like');
  
  const post = {
    file,
    filepath,
    slug: getSlug(file),
    title: fm.title,
    categories: fm.categories,
    hasSection,
    content
  };
  
  const idx = posts.length;
  posts.push(post);
  
  for (const cat of fm.categories) {
    if (!categoryMap[cat]) categoryMap[cat] = [];
    categoryMap[cat].push(idx);
  }
}

console.log(`Parsed ${posts.length} posts, ${Object.keys(categoryMap).length} categories`);

let processed = 0;
let skipped = 0;

for (let i = 0; i < posts.length; i++) {
  const post = posts[i];
  
  if (post.hasSection) {
    skipped++;
    continue;
  }
  
  // Collect related posts from same categories
  const relatedSet = new Set();
  
  for (const cat of post.categories) {
    const indices = categoryMap[cat] || [];
    for (const idx of indices) {
      if (idx !== i) relatedSet.add(idx);
    }
  }
  
  let related = Array.from(relatedSet);
  
  // If not enough, add from other categories
  if (related.length < MIN_LINKS) {
    // Get all other posts, shuffled
    const allOthers = posts
      .map((_, idx) => idx)
      .filter(idx => idx !== i && !relatedSet.has(idx));
    
    // Shuffle
    for (let j = allOthers.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [allOthers[j], allOthers[k]] = [allOthers[k], allOthers[j]];
    }
    
    const needed = MIN_LINKS - related.length;
    related = related.concat(allOthers.slice(0, needed));
  }
  
  // Shuffle related and pick up to MAX_LINKS
  for (let j = related.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [related[j], related[k]] = [related[k], related[j]];
  }
  
  const selected = related.slice(0, MAX_LINKS);
  
  if (selected.length === 0) {
    console.log(`SKIP (no related): ${post.file}`);
    skipped++;
    continue;
  }
  
  // Build section
  const links = selected.map(idx => {
    const p = posts[idx];
    return `- [${p.title}](/posts/${p.slug}/)`;
  });
  
  const section = `\n\n---\n\n## You Might Also Like\n\n${links.join('\n')}\n`;
  
  // Append to file
  const newContent = post.content.trimEnd() + section;
  fs.writeFileSync(post.filepath, newContent, 'utf-8');
  processed++;
}

console.log(`\nDone! Processed: ${processed}, Skipped: ${skipped}`);
