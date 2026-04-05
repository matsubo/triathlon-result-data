/**
 * Fetch race results from JTU API and save as TSV
 * Usage: node scripts/fetch_jtu_results.mjs <event_id> <program_id> <output_path>
 *
 * API endpoints:
 *   GET /api/programs/{program_id}/result_tables -> list of result_table_id
 *   GET /api/results?cond[result_table_id]={id}  -> table header + rows
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

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

async function apiGet(path, params = {}) {
  const qs = Object.keys(params).length > 0 ? '?' + buildQS(params) : '';
  const url = `${API_BASE}${path}${qs}`;
  process.stderr.write(`GET ${url}\n`);
  const r = await httpsGet(url);
  if (r.status !== 200) {
    throw new Error(`HTTP ${r.status} for ${url}: ${r.body.substring(0, 200)}`);
  }
  const data = JSON.parse(r.body);
  if (data.res.code !== 2001) {
    throw new Error(`API error ${data.res.code}: ${data.res.message}`);
  }
  return data.res.body;
}

async function getResultTables(programId) {
  return await apiGet(`/api/programs/${programId}/result_tables`);
}

async function getResults(params) {
  return await apiGet('/api/results', { cond: params });
}

function buildTsv(resultCols, resultList, hasSub) {
  // Build header row from columns
  const headers = resultCols
    .filter(col => col.result_col_type !== 'athlete_id' && col.result_col_type !== 'sub_name')
    .map(col => col.result_col_caption);

  const rows = [headers.join('\t')];

  // Build data rows
  for (const row of resultList) {
    const cells = [];
    let colIdx = 0;
    for (const col of resultCols) {
      if (col.result_col_type === 'athlete_id' || col.result_col_type === 'sub_name') {
        colIdx++;
        continue;
      }
      const val = row[`col_${colIdx + 1}`] ?? '';
      cells.push(String(val).trim());
      colIdx++;
    }
    rows.push(cells.join('\t'));
  }

  return rows.join('\n') + '\n';
}

async function fetchProgramResults(programId) {
  // Get result tables for this program
  const tables = await getResultTables(programId);
  process.stderr.write(`Result tables: ${JSON.stringify(tables.map(t => ({id: t.result_table_id, caption: t.result_table_caption, hasSub: t.result_table_has_sub})))}\n`);

  const allRows = [];
  let headers = null;

  for (const table of tables) {
    const tableId = table.result_table_id;
    const data = await getResults({ result_table_id: tableId });

    const { result_cols, result_list } = data;
    process.stderr.write(`Table ${tableId}: ${result_list.length} rows, ${result_cols.length} cols\n`);

    if (!headers) {
      headers = result_cols
        .filter(col => col.result_col_type !== 'athlete_id' && col.result_col_type !== 'sub_name')
        .map(col => col.result_col_caption);
    }

    for (const row of result_list) {
      const cells = [];
      let colIdx = 0;
      for (const col of result_cols) {
        if (col.result_col_type === 'athlete_id' || col.result_col_type === 'sub_name') {
          colIdx++;
          continue;
        }
        const val = row[`col_${colIdx + 1}`] ?? '';
        cells.push(String(val).trim());
        colIdx++;
      }
      allRows.push(cells.join('\t'));
    }
  }

  return [headers.join('\t'), ...allRows].join('\n') + '\n';
}

const programId = process.argv[2];
const outputPath = process.argv[3];

if (!programId) {
  process.stderr.write('Usage: node scripts/fetch_jtu_results.mjs <program_id> [output_path]\n');
  process.stderr.write('Example: node scripts/fetch_jtu_results.mjs 244_1 master/2024/nanki_shirahama/default.tsv\n');
  process.exit(1);
}

const tsv = await fetchProgramResults(programId);

if (outputPath) {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outputPath, tsv, 'utf-8');
  process.stderr.write(`Saved to: ${outputPath}\n`);
} else {
  process.stdout.write(tsv);
}
