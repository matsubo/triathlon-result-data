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
      res.on('end', () => resolve({status: res.statusCode, url, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Check all year pages on ainantriathlon.jp
const years = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];

for (const year of years) {
  const url = `https://ainantriathlon.jp/result${year}/`;
  try {
    const r = await httpGet(url);
    if (r.status === 200) {
      const text = r.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const pdfLinks = [...r.body.matchAll(/href="([^"]+\.pdf)"/gi)].map(m => m[1]);
      process.stdout.write(`\n=== ${year} (${r.status}) ===\n`);
      process.stdout.write('  PDF links: ' + JSON.stringify(pdfLinks) + '\n');
      process.stdout.write('  Text (500): ' + text.substring(0, 500) + '\n');
    } else {
      process.stdout.write(`${year}: ${r.status}\n`);
    }
  } catch(e) {
    process.stdout.write(`${year}: ERROR ${e.message}\n`);
  }
}
