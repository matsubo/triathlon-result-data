/**
 * Fetch 2024 subevent UUIDs for all IRONMAN races using existing event UUIDs.
 * Reads __NEXT_DATA__ from labs-v2.competitor.com event pages.
 *
 * Usage: bun run scripts/fetch-ironman-subevents.js --year 2024
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const yearIdx = args.indexOf("--year");
const targetYear = yearIdx !== -1 ? args[yearIdx + 1] : "2024";

const subeventsPath = join(__dirname, "ironman-subevent-ids.json");
const existing = JSON.parse(readFileSync(subeventsPath, "utf-8"));

// Collect unique event UUIDs
const eventUuids = new Map();
for (const [raceId, info] of Object.entries(existing)) {
  if (raceId === "not_found") continue;
  if (!eventUuids.has(info.event_uuid)) {
    eventUuids.set(info.event_uuid, { raceId, name: info.name });
  }
}

console.log(
  `🔍 Searching ${eventUuids.size} event pages for ${targetYear} subevents...`,
);

const results = {};

for (const [eventUuid, meta] of eventUuids) {
  const url = `https://labs-v2.competitor.com/results/event/${eventUuid}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`  ⚠️  ${meta.raceId}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();

    // Extract __NEXT_DATA__
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
    );
    if (!match) {
      console.log(`  ⚠️  ${meta.raceId}: no __NEXT_DATA__`);
      continue;
    }

    const nextData = JSON.parse(match[1]);
    const subevents = nextData.props?.pageProps?.subevents || [];

    // Find target year subevents
    const yearSubevents = subevents.filter((se) => {
      const date = se.wtc_eventdate || "";
      return date.startsWith(targetYear);
    });

    if (yearSubevents.length === 0) {
      continue;
    }

    for (const se of yearSubevents) {
      const name = se.wtc_name || se.wtc_externaleventname || "Unknown";
      const key = `${meta.raceId}_${targetYear}`;
      results[key] = {
        event_uuid: eventUuid,
        subevent_uuid: se.wtc_eventid,
        year: Number.parseInt(targetYear, 10),
        name,
        date: se.wtc_eventdate,
      };
      console.log(`  ✅ ${name}: ${se.wtc_eventid}`);
    }
  } catch (err) {
    console.log(`  ❌ ${meta.raceId}: ${err.message}`);
  }

  // Small delay
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// Save results
const outputPath = join(__dirname, `ironman-subevent-ids-${targetYear}.json`);
writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(
  `\n📦 Found ${Object.keys(results).length} subevents for ${targetYear}`,
);
console.log(`   Saved to ${outputPath}`);
