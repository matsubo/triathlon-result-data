import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url, referer) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ja,en;q=0.9',
        'Referer': referer || 'https://www.jtu.or.jp/',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        resolve(httpsGet(loc, referer));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
  });
}

const eventId = process.argv[2] || '325';

// Fetch program.min.js.php - this is the key dynamic file
const jsUrl = `https://results.jtu.or.jp/resarc/program.min.js.php`;
const r = await httpsGet(jsUrl, `https://www.jtu.or.jp/result_program/?event_id=${eventId}`);
process.stdout.write(`Status: ${r.status}\n`);
process.stdout.write('Program JS (first 8000 chars):\n' + r.body.substring(0, 8000) + '\n');

// Find API endpoints
const allUrls = [...r.body.matchAll(/["'`]((?:https?:\/\/|\/api\/|\/res)[^"'`\s]*?)["'`]/g)].map(m => m[1]);
process.stdout.write('\nURLs found:\n');
[...new Set(allUrls)].forEach(u => process.stdout.write('  ' + u + '\n'));
