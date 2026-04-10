/**
 * Fetch all subevent UUIDs for IRONMAN 70.3 races across all years.
 * Reads event UUIDs from im703-event-uuids.json and crawls competitor.com pages.
 *
 * Usage: bun run scripts/fetch-im703-subevents.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const eventUuidsPath = join(__dirname, "im703-event-uuids.json");
const eventUuids = JSON.parse(readFileSync(eventUuidsPath, "utf-8"));

console.log(
  `🔍 Fetching subevents for ${Object.keys(eventUuids).length} IRONMAN 70.3 events...`,
);

const allSubevents = {};

for (const [raceId, eventUuid] of Object.entries(eventUuids)) {
  const url = `https://labs-v2.competitor.com/results/event/${eventUuid}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`  ⚠️  ${raceId}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();

    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
    );
    if (!match) {
      console.log(`  ⚠️  ${raceId}: no __NEXT_DATA__`);
      continue;
    }

    const nextData = JSON.parse(match[1]);
    const subevents = nextData.props?.pageProps?.subevents || [];

    // Filter to IRONMAN 70.3 subevents only (exclude Aquabike, 5150, etc.)
    const im703Subevents = subevents.filter((se) => {
      const name = (se.wtc_name || se.wtc_externaleventname || "").toLowerCase();
      return (
        name.includes("70.3") &&
        !name.includes("aquabike") &&
        !name.includes("5150") &&
        !name.includes("relay")
      );
    });

    let count = 0;
    for (const se of im703Subevents) {
      const name = se.wtc_name || se.wtc_externaleventname || "Unknown";
      const date = se.wtc_eventdate || "";
      const yearMatch = date.match(/^(\d{4})/);
      if (!yearMatch) continue;

      const year = yearMatch[1];
      const key = `${raceId}_${year}`;
      allSubevents[key] = {
        event_uuid: eventUuid,
        subevent_uuid: se.wtc_eventid,
        year: Number.parseInt(year, 10),
        name,
        date,
        race_base: raceId,
      };
      count++;
    }

    if (count > 0) {
      console.log(`  ✅ ${raceId}: ${count} subevents`);
    } else {
      console.log(`  ⚠️  ${raceId}: 0 70.3 subevents found`);
    }
  } catch (err) {
    console.log(`  ❌ ${raceId}: ${err.message}`);
  }

  // Small delay
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const outputPath = join(__dirname, "im703-all-subevents.json");
writeFileSync(outputPath, `${JSON.stringify(allSubevents, null, 2)}\n`);

// Summary by year
const byYear = {};
for (const entry of Object.values(allSubevents)) {
  byYear[entry.year] = (byYear[entry.year] || 0) + 1;
}
const sortedYears = Object.keys(byYear)
  .sort()
  .map((y) => `${y}: ${byYear[y]}`);

console.log(
  `\n📦 Found ${Object.keys(allSubevents).length} total subevents across ${Object.keys(byYear).length} years`,
);
console.log(`   By year: ${sortedYears.join(", ")}`);
console.log(`   Saved to ${outputPath}`);
