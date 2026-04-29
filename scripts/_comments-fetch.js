const fs = require('fs');
const https = require('https');

const token = fs.readFileSync('/home/vivius/.git-credentials','utf8').trim().split('\n')[0].split(/[\/:@]/)[4];

const query = `query { repository(owner: "opobull", name: "withintrend") { discussions(first: 30, categoryId: "DIC_kwDORheoxs4C79zj", orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { id title url updatedAt comments(first: 50) { nodes { id author { login } body createdAt replies(first: 20) { nodes { id author { login } body createdAt } } } } } } } }`;

const data = JSON.stringify({ query });

const req = https.request({
  hostname: 'api.github.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Authorization': 'bearer ' + token,
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'User-Agent': 'sinseolbot'
  }
}, res => {
  let body='';
  res.on('data', c=>body+=c);
  res.on('end', ()=>{
    fs.writeFileSync('/home/vivius/claude-code/workspace/withintrend/data/_comments-snapshot.json', body);
    console.log('OK '+body.length);
  });
});
req.on('error', e=>{ console.error('ERR', e.message); process.exit(1); });
req.write(data);
req.end();
