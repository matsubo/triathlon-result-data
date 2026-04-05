import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'ja,en;q=0.9',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
  });
}

const eventId = process.argv[2] || '325';
const r = await httpsGet(`https://www.jtu.or.jp/result_program/?event_id=${eventId}`);
process.stdout.write('Status: ' + r.status + '\n');
process.stdout.write(r.body.substring(0, 8000) + '\n');
