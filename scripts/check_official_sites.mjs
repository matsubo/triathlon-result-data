import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');
const http = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'ja,en;q=0.9',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        resolve(httpGet(loc));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const pages = [
  'https://ainantriathlon.jp/race_report/',
  'https://hiwasa-triathlon.jp/record/',
  'http://shirahama-triathlon.com/record/',
];

for (const url of pages) {
  try {
    const r = await httpGet(url);
    process.stdout.write(`\n=== ${url} === (status: ${r.status})\n`);
    const links = [...r.body.matchAll(/href="([^"]+)"/g)].map(m => m[1])
      .filter(l => /result|record|201[0-9]|202[0-2]/.test(l));
    links.slice(0, 30).forEach(l => process.stdout.write('  ' + l + '\n'));
    // Also show page text snippet
    const text = r.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 1000);
    process.stdout.write('  Text: ' + text + '\n');
  } catch(e) {
    process.stdout.write(`ERROR: ${url}: ${e.message}\n`);
  }
}
