/**
 * Discover IRONMAN 70.3 event UUIDs from ironman.com race result pages.
 * Each race page embeds a competitor.com iframe with the event UUID.
 *
 * Usage: bun run scripts/fetch-im703-event-uuids.js
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Known IRONMAN 70.3 race slugs on ironman.com
// Format: { slug: "im703-cairns", id: "im703_cairns" }
const RACES_703 = [
  { slug: "im703-cairns", id: "im703_cairns" },
  { slug: "im703-world-championships", id: "im703_world_championship" },
  { slug: "im703-st-george", id: "im703_st_george" },
  { slug: "im703-chattanooga", id: "im703_chattanooga" },
  { slug: "im703-gulf-coast", id: "im703_gulf_coast" },
  { slug: "im703-hawaii", id: "im703_hawaii" },
  { slug: "im703-boulder", id: "im703_boulder" },
  { slug: "im703-coeur-dalene", id: "im703_coeur_dalene" },
  { slug: "im703-florida", id: "im703_florida" },
  { slug: "im703-wisconsin", id: "im703_wisconsin" },
  { slug: "im703-michigan", id: "im703_michigan" },
  { slug: "im703-ohio", id: "im703_ohio" },
  { slug: "im703-oregon", id: "im703_oregon" },
  { slug: "im703-maine", id: "im703_maine" },
  { slug: "im703-new-york", id: "im703_new_york" },
  { slug: "im703-north-carolina", id: "im703_north_carolina" },
  { slug: "im703-augusta", id: "im703_augusta" },
  { slug: "im703-louisville", id: "im703_louisville" },
  { slug: "im703-des-moines", id: "im703_des_moines" },
  { slug: "im703-eagleman", id: "im703_eagleman" },
  { slug: "im703-muncie", id: "im703_muncie" },
  { slug: "im703-rockford", id: "im703_rockford" },
  { slug: "im703-santa-cruz", id: "im703_santa_cruz" },
  { slug: "im703-texas", id: "im703_texas" },
  { slug: "im703-waco", id: "im703_waco" },
  { slug: "im703-indian-wells", id: "im703_indian_wells" },
  { slug: "im703-boise", id: "im703_boise" },
  { slug: "im703-calgary", id: "im703_calgary" },
  { slug: "im703-mont-tremblant", id: "im703_mont_tremblant" },
  { slug: "im703-muskoka", id: "im703_muskoka" },
  { slug: "im703-washington-tri-cities", id: "im703_washington" },
  { slug: "im703-western-massachusetts", id: "im703_western_mass" },
  { slug: "im703-happy-valley", id: "im703_happy_valley" },
  { slug: "im703-musselman", id: "im703_musselman" },
  { slug: "im703-mallorca", id: "im703_mallorca" },
  { slug: "im703-valencia", id: "im703_valencia" },
  { slug: "im703-venice-jesolo", id: "im703_venice" },
  { slug: "im703-barcelona", id: "im703_barcelona" },
  { slug: "im703-nice", id: "im703_nice" },
  { slug: "im703-vichy", id: "im703_vichy" },
  { slug: "im703-aix-en-provence", id: "im703_aix" },
  { slug: "im703-tours", id: "im703_tours" },
  { slug: "im703-switzerland", id: "im703_switzerland" },
  { slug: "im703-zell-am-see", id: "im703_zell_am_see" },
  { slug: "im703-kraichgau", id: "im703_kraichgau" },
  { slug: "im703-duisburg", id: "im703_duisburg" },
  { slug: "im703-erkner", id: "im703_erkner" },
  { slug: "im703-hamburg", id: "im703_hamburg" },
  { slug: "im703-bolton", id: "im703_bolton" },
  { slug: "im703-swansea", id: "im703_swansea" },
  { slug: "im703-weymouth", id: "im703_weymouth" },
  { slug: "im703-elsinore", id: "im703_elsinore" },
  { slug: "im703-jonkoping", id: "im703_jonkoping" },
  { slug: "im703-tallinn", id: "im703_tallinn" },
  { slug: "im703-warsaw", id: "im703_warsaw" },
  { slug: "im703-krakow", id: "im703_krakow" },
  { slug: "im703-poznan", id: "im703_poznan" },
  { slug: "im703-hradec-kralove", id: "im703_hradec" },
  { slug: "im703-luxembourg", id: "im703_luxembourg" },
  { slug: "im703-westfriesland", id: "im703_westfriesland" },
  { slug: "im703-knokke-heist", id: "im703_knokke" },
  { slug: "im703-belgrade", id: "im703_belgrade" },
  { slug: "im703-portugal-cascais", id: "im703_portugal" },
  { slug: "im703-porec", id: "im703_porec" },
  { slug: "im703-italy-emilia-romagna", id: "im703_emilia_romagna" },
  { slug: "im703-marathon-greece", id: "im703_marathon" },
  { slug: "im703-turkey", id: "im703_turkey" },
  { slug: "im703-oman", id: "im703_oman" },
  { slug: "im703-salalah", id: "im703_salalah" },
  { slug: "im703-south-africa", id: "im703_south_africa" },
  { slug: "im703-port-macquarie", id: "im703_port_macquarie" },
  { slug: "im703-melbourne", id: "im703_melbourne" },
  { slug: "im703-taiwan", id: "im703_taiwan" },
  { slug: "im703-kenting", id: "im703_kenting" },
  { slug: "im703-desaru-coast", id: "im703_desaru" },
  { slug: "im703-langkawi", id: "im703_langkawi" },
  { slug: "im703-shanghai", id: "im703_shanghai" },
  { slug: "im703-goseong", id: "im703_goseong" },
  { slug: "im703-subic-bay", id: "im703_subic" },
  { slug: "im703-lapu-lapu", id: "im703_lapu_lapu" },
  { slug: "im703-phu-quoc", id: "im703_phu_quoc" },
  { slug: "im703-goa", id: "im703_goa" },
  { slug: "im703-puerto-princesa", id: "im703_puerto_princesa" },
  { slug: "im703-cozumel", id: "im703_cozumel" },
  { slug: "im703-arizona", id: "im703_arizona" },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Load existing results to skip already-found UUIDs
  const outputPath = join(__dirname, "im703-event-uuids.json");
  const results = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, "utf-8"))
    : {};
  let found = Object.keys(results).length;
  let notFound = 0;

  for (const race of RACES_703) {
    if (results[race.id]) {
      console.log(`  ⏭️  ${race.id}: already found (${results[race.id]})`);
      continue;
    }
    const url = `https://www.ironman.com/races/${race.slug}/results`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Wait longer for iframes to load (cookie consent + iframe rendering)
      await page.waitForTimeout(8000);

      // Find competitor.com iframe
      const frames = page.frames();
      let eventUuid = null;
      for (const frame of frames) {
        const frameUrl = frame.url();
        const match = frameUrl.match(
          /labs-v2\.competitor\.com\/results\/event\/([a-f0-9-]+)/,
        );
        if (match) {
          eventUuid = match[1];
          break;
        }
      }

      if (eventUuid) {
        results[race.id] = eventUuid;
        found++;
        console.log(`  ✅ ${race.id}: ${eventUuid}`);
      } else {
        notFound++;
        console.log(`  ⚠️  ${race.id}: no competitor.com iframe found`);
      }
    } catch (err) {
      notFound++;
      console.log(`  ❌ ${race.id}: ${err.message}`);
    }

    // Be polite
    await page.waitForTimeout(2000);
  }

  await browser.close();

  writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(
    `\n📦 Found ${found} event UUIDs, ${notFound} not found. Saved to ${outputPath}`,
  );
}

main().catch(console.error);
