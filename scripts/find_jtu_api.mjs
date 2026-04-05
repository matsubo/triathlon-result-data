/**
 * Discover JTU results API endpoints by checking page JS files
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ja,en;q=0.9',
        'Referer': 'https://www.jtu.or.jp/',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        resolve(httpsGet(loc));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
  });
}

// Get result program page and find JS files
const eventId = process.argv[2] || '325';
const pageUrl = `https://www.jtu.or.jp/result_program/?event_id=${eventId}`;
const page = await httpsGet(pageUrl);

// Find all JS files
const jsFiles = [...page.body.matchAll(/src="([^"]+\.js[^"]*?)"/g)].map(m => m[1]);
process.stdout.write('JS files found:\n');
jsFiles.forEach(f => process.stdout.write('  ' + f + '\n'));

// Look for API URLs in HTML
const apiMatches = [...page.body.matchAll(/https?:\/\/results\.jtu[^\s"'<]+/g)].map(m => m[0]);
process.stdout.write('\nAPI URLs in HTML:\n');
apiMatches.forEach(u => process.stdout.write('  ' + u + '\n'));

// Look for any JS files specific to result
const resultJs = jsFiles.filter(f => f.includes('result') || f.includes('app'));
process.stdout.write('\nResult/app JS files:\n');
resultJs.forEach(f => process.stdout.write('  ' + f + '\n'));

// Try to fetch the main app JS to find API endpoints
if (resultJs.length > 0) {
  const jsUrl = resultJs[0].startsWith('http') ? resultJs[0] : `https://www.jtu.or.jp${resultJs[0]}`;
  const js = await httpsGet(jsUrl);
  process.stdout.write('\nJS file content (first 3000 chars):\n' + js.body.substring(0, 3000) + '\n');

  // Find API endpoints
  const endpoints = [...js.body.matchAll(/(results\.jtu[^\s"'`]+|\/api\/[^\s"'`]+)/g)].map(m => m[0]);
  process.stdout.write('\nAPI endpoints in JS:\n');
  [...new Set(endpoints)].forEach(e => process.stdout.write('  ' + e + '\n'));
}
