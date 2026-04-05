import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.jtu.or.jp/result_program/?event_id=325',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        resolve(httpsGet(loc));
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

// Fetch program.min.js.php
const eventId = process.argv[2] || '325';
const jsUrl = 'https://results.jtu.or.jp/resarc/program.min.js.php';
const common = await httpsGet('https://results.jtu.or.jp/resarc/common.min.js');
process.stdout.write('Common JS (first 5000 chars):\n' + common.body.substring(0, 5000) + '\n\n');

// Find API URLs in common JS
const apiUrls = [...common.body.matchAll(/(["'`])(\/api\/[^"'`]+|https?:\/\/[^\s"'`]+api[^"'`]*)\1/g)].map(m => m[2]);
process.stdout.write('API URLs in common.min.js:\n');
apiUrls.forEach(u => process.stdout.write('  ' + u + '\n'));

// Find fetch/ajax calls
const fetchCalls = [...common.body.matchAll(/fetch\s*\(\s*(["'`])([^"'`]+)\1/g)].map(m => m[2]);
const ajaxCalls = [...common.body.matchAll(/\$\.ajax\s*\(\s*\{[^}]*url\s*:\s*(["'`])([^"'`]+)\1/g)].map(m => m[2]);
process.stdout.write('\nfetch calls:\n');
fetchCalls.forEach(u => process.stdout.write('  ' + u + '\n'));
process.stdout.write('\n$.ajax calls:\n');
ajaxCalls.forEach(u => process.stdout.write('  ' + u + '\n'));

// Search for result-related strings
const resultStrings = [...common.body.matchAll(/["'`]([^"'`]*result[^"'`]*)["'`]/gi)].map(m => m[1]).filter(s => s.length < 200);
process.stdout.write('\nresult-related strings:\n');
[...new Set(resultStrings)].slice(0, 20).forEach(s => process.stdout.write('  ' + s + '\n'));
