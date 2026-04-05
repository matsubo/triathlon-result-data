/**
 * Search for JTU events by name
 * Usage: node scripts/search_jtu_event.mjs "南紀白浜"
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

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
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8')}));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
  });
}

function buildQS(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        parts.push(`${encodeURIComponent(key)}[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

async function searchEvents(keyword) {
  const qs = buildQS({ cond: { event_name: keyword } });
  const url = `${API_BASE}/api/events/search?${qs}`;
  process.stderr.write(`Fetching: ${url}\n`);
  const r = await httpsGet(url);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

const keyword = process.argv[2] || '南紀白浜';
const result = await searchEvents(keyword);
if (result.res.code === 2001) {
  const events = result.res.body.events;
  process.stdout.write(`Found ${events.length} event(s) for "${keyword}":\n`);
  for (const ev of events) {
    process.stdout.write(`  event_id=${ev.event_id} date=${ev.event_date?.substring(0,10)} name="${ev.event_name}"\n`);
    const programs = result.res.body.programs?.[ev.event_id] || [];
    for (const prog of programs) {
      process.stdout.write(`    program_id=${prog.program_id} name="${prog.program_name}"\n`);
    }
  }
} else {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
