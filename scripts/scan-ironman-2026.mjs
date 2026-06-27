// Live-scan labs-v2 for 2026 IRONMAN subevents already raced (date <= today).
// Reads /tmp/im-uuids.json (event_uuid -> race_base). Writes /tmp/im-2026-scan.json.
import { readFileSync, writeFileSync } from "node:fs";

const TODAY = "2026-06-28";
const uuids = JSON.parse(readFileSync("/tmp/im-uuids.json", "utf8"));
const entries = Object.entries(uuids);
const out = [];
let i = 0;
for (const [uuid, base] of entries) {
  i++;
  try {
    const res = await fetch(`https://labs-v2.competitor.com/results/event/${uuid}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) { process.stderr.write(`[${i}/${entries.length}] ${base}: HTTP ${res.status}\n`); continue; }
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
    if (!m) { process.stderr.write(`[${i}/${entries.length}] ${base}: no __NEXT_DATA__\n`); continue; }
    const nd = JSON.parse(m[1]);
    const subs = nd.props?.pageProps?.subevents || [];
    for (const se of subs) {
      const date = (se.wtc_eventdate || "").slice(0, 10);
      if (date.startsWith("2026") && date <= TODAY) {
        out.push({ base, uuid, subevent_uuid: se.wtc_eventid, name: se.wtc_name || se.wtc_externaleventname, date });
      }
    }
  } catch (e) {
    process.stderr.write(`[${i}/${entries.length}] ${base}: ${e.message}\n`);
  }
  await new Promise((r) => setTimeout(r, 200));
}
writeFileSync("/tmp/im-2026-scan.json", JSON.stringify(out, null, 2));
process.stderr.write(`DONE: ${out.length} raced-2026 subevents across ${entries.length} events\n`);
