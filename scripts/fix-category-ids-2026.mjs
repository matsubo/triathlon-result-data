// Fix duplicate category ids introduced when importing multi-category JTU 2026
// editions (all categories had id = event id, so the app's category tabs collided
// e.g. clicking スプリント showed スタンダード). Assign distinct ids matching the
// repo convention (stable per category type across years).
import { readFileSync, writeFileSync } from "node:fs";

// event -> edition-year -> { result_tsv substring : correct id }
const FIX = {
  kanagawa:        { "2026": { "default.tsv": "kanagawa", "sprint.tsv": "kanagawa_sprint" } },
  baramon:         { "2026": { "a.tsv": "baramon_a", "b.tsv": "baramon_b" } },
  uminomori:       { "2026": { "short.tsv": "uminomori_short", "sprint.tsv": "uminomori_sprint" } },
  tangram_madarao: { "2025": { "elite.tsv": "tangram_madarao_elite", "regular.tsv": "tangram_madarao_regular" } },
};

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const changes = [];
for (const [eventId, byYear] of Object.entries(FIX)) {
  const ev = data.events.find((e) => e.id === eventId);
  if (!ev) { console.error(`no event ${eventId}`); process.exit(1); }
  for (const [year, map] of Object.entries(byYear)) {
    const ed = ev.editions.find((e) => e.date.startsWith(year));
    if (!ed) { console.error(`no ${eventId} ${year}`); process.exit(1); }
    for (const c of ed.categories) {
      const key = Object.keys(map).find((k) => c.result_tsv.endsWith(k));
      if (key && c.id !== map[key]) { changes.push(`${eventId} ${year}: ${c.id} -> ${map[key]} (${c.name})`); c.id = map[key]; }
    }
  }
}
writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log(changes.join("\n") || "no changes");
