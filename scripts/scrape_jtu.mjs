#!/usr/bin/env node
/**
 * JTU result scraper
 * Usage: node scripts/scrape_jtu.mjs <event_id>
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'ja,en;q=0.9',
        'Referer': 'https://www.jtu.or.jp/',
        ...headers
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location, headers));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf-8')
      }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const eventId = process.argv[2];
if (!eventId) {
  console.error('Usage: node scripts/scrape_jtu.mjs <event_id>');
  process.exit(1);
}

(async () => {
  // Try different API patterns
  const apiPaths = [
    `https://results.jtu.or.jp/api/event/${eventId}/programs`,
    `https://results.jtu.or.jp/api/programs?event_id=${eventId}`,
    `https://results.jtu.or.jp/api/${eventId}/programs`,
  ];

  for (const url of apiPaths) {
    const r = await httpsGet(url);
    if (r.status === 200) {
      console.log('Found API at:', url);
      console.log(r.body.substring(0, 2000));
      break;
    }
    console.log(`${url} -> ${r.status}`);
  }

  // Fetch the HTML page to get program list
  const pageUrl = `https://www.jtu.or.jp/result_program/?event_id=${eventId}`;
  console.log('\nFetching HTML page:', pageUrl);
  const r = await httpsGet(pageUrl);
  console.log('Status:', r.status);
  // Look for result links in HTML
  const matches = r.body.match(/result\?event_id[^"']*/g) || [];
  console.log('Result links found:', [...new Set(matches)].slice(0, 20));

  // Also check for any JSON data embedded in page
  const jsonMatches = r.body.match(/window\.__[A-Z_]+\s*=\s*({[\s\S]*?});/g) || [];
  console.log('Embedded JSON:', jsonMatches.slice(0, 5));
})().catch(console.error);
