import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ja,en;q=0.9',
        'Referer': 'https://www.jtu.or.jp/',
        ...extraHeaders
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        resolve(httpsGet(loc, extraHeaders));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`timeout`)); });
  });
}

const r = await httpsGet('https://results.jtu.or.jp/resarc/result.min.js.php');
process.stdout.write(`Status: ${r.status}\n`);
process.stdout.write('Content:\n' + r.body + '\n');
