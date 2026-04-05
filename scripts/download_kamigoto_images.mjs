import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const https = require('https');

function httpsGet(url, referer) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': referer || 'https://kamigoto-triathlon.amebaownd.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location, referer));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

const images = [
  // 2024 standard
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/9bbc2a1623e8667a5ee6581c4b2b1e3d_7fe9359132ae27ed20641d1585d8453c.jpg',
    path: '/tmp/kamigoto_2024_standard_1.jpg'
  },
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/95e869c43ddd847bf4d17cc2b8002d9b_ed08b36230392ca61458dd633a084634.jpg',
    path: '/tmp/kamigoto_2024_standard_2.jpg'
  },
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/3232a8b1224a076c8dd4a75bf5d535aa_10fee2f8da157d53541dd1c3b7443871.jpg',
    path: '/tmp/kamigoto_2024_standard_3.jpg'
  },
  // 2025 standard
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/a15fa05587b13c93b88430422f7cd869_054a9fecfd4982e99d6114faad7af66a.jpg',
    path: '/tmp/kamigoto_2025_standard_1.jpg'
  },
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/532890770a483a4dee751270b1d9e0a3_915b936fbc40c49412219c597bbfe2b8.jpg',
    path: '/tmp/kamigoto_2025_standard_2.jpg'
  },
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/951bdad4ebc7b0f02954aa69fc52875f_f736c7a0b846f9f64763ca48065fb3ba.jpg',
    path: '/tmp/kamigoto_2025_standard_3.jpg'
  },
  // 2023 regular
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/9f0f148181f46835a7da5ac1cfc86095_d97509461deadedf2cc95f35336b2db5.jpg',
    path: '/tmp/kamigoto_2023_standard_1.jpg'
  },
  {
    url: 'https://cdn.amebaowndme.com/madrid-prd/madrid-web/images/sites/2074156/2066dcdc5e31f0bfa9f3ff90995faa1d_a876361043bca981ac8d0f78d2ba4341.jpg',
    path: '/tmp/kamigoto_2023_standard_2.jpg'
  },
];

for (const img of images) {
  const r = await httpsGet(img.url);
  if (r.status === 200) {
    writeFileSync(img.path, r.buffer);
    console.log(`Saved ${img.path} (${r.buffer.length} bytes)`);
  } else {
    console.log(`Failed ${img.url}: HTTP ${r.status}`);
  }
}
