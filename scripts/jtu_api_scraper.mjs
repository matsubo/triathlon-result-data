/**
 * JTU results API scraper
 * API base: https://results.jtu.or.jp
 * Usage: node scripts/jtu_api_scraper.mjs <event_id>
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const https = require('https');

const BASE_DIR = '/Users/matsu/ghq/github.com/matsubo/triathlon-result-data';
const API_BASE = 'https://results.jtu.or.jp';

function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'ja,en;q=0.9',
        'Referer': 'https://www.jtu.or.jp/',
        'X-Requested-With': 'XMLHttpRequest',
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
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf-8')
      }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
  });
}

function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        parts.push(`${encodeURIComponent(key)}[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

async function searchEvent(eventId) {
  const params = buildQueryString({ cond: { event_id: eventId } });
  const url = `${API_BASE}/api/events/search?${params}`;
  process.stderr.write(`Fetching: ${url}\n`);
  const r = await httpsGet(url);
  if (r.status !== 200) {
    throw new Error(`HTTP ${r.status} for ${url}`);
  }
  return JSON.parse(r.body);
}

async function getResultData(eventId, programId) {
  // Try result JS to discover the result API
  const resultJsUrl = `${API_BASE}/resarc/result.min.js.php`;
  const jsRes = await httpsGet(resultJsUrl, { Referer: `https://www.jtu.or.jp/result/?event_id=${eventId}&program_id=${programId}` });
  process.stderr.write(`Result JS status: ${jsRes.status}\n`);

  // Extract API call patterns
  const apiPatterns = [...jsRes.body.matchAll(/apiServer\s*\+\s*["'`]([^"'`]+)["'`]/g)].map(m => m[1]);
  process.stderr.write(`API patterns: ${JSON.stringify(apiPatterns)}\n`);

  // Try known API endpoints
  const candidates = [
    `/api/results/search?cond[event_id]=${eventId}&cond[program_id]=${programId}`,
    `/api/result?event_id=${eventId}&program_id=${programId}`,
    `/api/events/${eventId}/programs/${programId}/results`,
  ];

  for (const path of candidates) {
    const url = API_BASE + path;
    process.stderr.write(`Trying: ${url}\n`);
    const r = await httpsGet(url);
    process.stderr.write(`  -> ${r.status}\n`);
    if (r.status === 200) {
      return { url, data: JSON.parse(r.body) };
    }
  }

  // Extract actual API call from JS
  return { apiPatterns, jsBody: jsRes.body.substring(0, 5000) };
}

const eventId = process.argv[2];
if (!eventId) {
  process.stderr.write('Usage: node scripts/jtu_api_scraper.mjs <event_id>\n');
  process.exit(1);
}

const result = await searchEvent(eventId);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
