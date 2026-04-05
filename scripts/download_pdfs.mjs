/**
 * Download PDF files for race results
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
const require = createRequire(import.meta.url);
const https = require('https');
const http = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        resolve(httpGet(loc));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, buffer: Buffer.concat(chunks)}));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const pdfs = [
  // Ainan
  { url: 'https://ainantriathlon.jp/wp-content/uploads/2014/06/result_new.pdf', path: '/tmp/ainan_2014.pdf' },
  { url: 'https://ainantriathlon.jp/wp-content/uploads/2015/06/result_new.pdf', path: '/tmp/ainan_2015.pdf' },
  { url: 'https://ainantriathlon.jp/wp-content/uploads/2016/06/result2016.pdf', path: '/tmp/ainan_2016.pdf' },
  { url: 'https://ainantriathlon.jp/wp-content/uploads/2017/06/result2017.pdf', path: '/tmp/ainan_2017.pdf' },
  { url: 'https://ainantriathlon.jp/wp-content/uploads/2018/06/result2018.pdf', path: '/tmp/ainan_2018.pdf' },
  { url: 'http://www.jtu.or.jp/results/2019/19ainan_result.pdf', path: '/tmp/ainan_2019.pdf' },
  // Hiwasa
  { url: 'https://hiwasa-triathlon.jp/img/2014hiwasa_men.pdf', path: '/tmp/hiwasa_2014_men.pdf' },
  { url: 'https://hiwasa-triathlon.jp/img/2014hiwasa_women.pdf', path: '/tmp/hiwasa_2014_women.pdf' },
  { url: 'https://hiwasa-triathlon.jp/img/2015hiwasa_results.pdf', path: '/tmp/hiwasa_2015_results.pdf' },
  { url: 'https://hiwasa-triathlon.jp/img/2016hiwasa_results.pdf', path: '/tmp/hiwasa_2016_results.pdf' },
  { url: 'https://hiwasa-triathlon.jp/img/2017hiwasa_results.pdf', path: '/tmp/hiwasa_2017_results.pdf' },
  { url: 'https://hiwasa-triathlon.jp/img/2018hiwasa_results.pdf', path: '/tmp/hiwasa_2018_results.pdf' },
  { url: 'https://hiwasa-triathlon.jp/img/2019hiwasa_results.pdf', path: '/tmp/hiwasa_2019_results.pdf' },
  // Nanki Shirahama
  { url: 'http://shirahama-triathlon.com/wp-content/uploads/2015/11/1stshirahama-all.pdf', path: '/tmp/nanki_2016_all.pdf' },
  { url: 'http://shirahama-triathlon.com/wp-content/uploads/2015/11/2ndshirahama-all.pdf', path: '/tmp/nanki_2017_all.pdf' },
  { url: 'http://shirahama-triathlon.com/wp-content/uploads/2015/11/3rdshirahama-all.pdf', path: '/tmp/nanki_2018_all.pdf' },
  { url: 'http://shirahama-triathlon.com/wp-content/uploads/2017/05/4thshirahama-sougou.pdf', path: '/tmp/nanki_2019_all.pdf' },
  { url: 'http://shirahama-triathlon.com/wp-content/uploads/2018/05/5th-shirahama-record.pdf', path: '/tmp/nanki_2022_men.pdf' },
  { url: 'http://shirahama-triathlon.com/wp-content/uploads/2019/06/19nankishirahama_result.pdf', path: '/tmp/nanki_2023_all.pdf' },
];

for (const { url, path } of pdfs) {
  try {
    process.stdout.write(`Downloading ${url} -> ${path}... `);
    const r = await httpGet(url);
    if (r.status === 200) {
      writeFileSync(path, r.buffer);
      process.stdout.write(`OK (${r.buffer.length} bytes)\n`);
    } else {
      process.stdout.write(`FAILED (${r.status})\n`);
    }
  } catch(e) {
    process.stdout.write(`ERROR: ${e.message}\n`);
  }
}
