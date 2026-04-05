/**
 * Retry failed Ironman 2025 races with longer timeout
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const FAILED = [
  { id: "ironman_brazil_2025",        name: "IRONMAN Brazil",              date: "2025-06-01", coachcox: 2188, dist: "LD", location: "Florianopolis, Brazil" },
  { id: "ironman_frankfurt_2025",     name: "IRONMAN Frankfurt",           date: "2025-06-29", coachcox: 2205, dist: "LD", location: "Frankfurt, Germany" },
  { id: "ironman_france_2025",        name: "IRONMAN France",              date: "2025-06-29", coachcox: 2191, dist: "LD", location: "Nice, France" },
  { id: "im703_mont_tremblant_2025",  name: "IRONMAN 70.3 Mont Tremblant", date: "2025-06-22", coachcox: 2443, dist: "MD", location: "Mont Tremblant, Quebec, Canada" },
  { id: "im703_luxembourg_2025",      name: "IRONMAN 70.3 Luxembourg",     date: "2025-07-13", coachcox: 2617, dist: "MD", location: "Luxembourg" },
  { id: "im703_swansea_2025",         name: "IRONMAN 70.3 Swansea",        date: "2025-07-13", coachcox: 2639, dist: "MD", location: "Swansea, Wales, UK" },
  { id: "im703_boise_2025",           name: "IRONMAN 70.3 Boise",          date: "2025-07-26", coachcox: 2594, dist: "MD", location: "Boise, Idaho, USA" },
  { id: "im703_ohio_2025",            name: "IRONMAN 70.3 Ohio",           date: "2025-07-20", coachcox: 2627, dist: "MD", location: "Delaware, Ohio, USA" },
  { id: "im703_oregon_2025",          name: "IRONMAN 70.3 Oregon",         date: "2025-07-20", coachcox: 2628, dist: "MD", location: "Portland, Oregon, USA" },
  { id: "im703_calgary_2025",         name: "IRONMAN 70.3 Calgary",        date: "2025-07-27", coachcox: 2734, dist: "MD", location: "Calgary, Alberta, Canada" },
  { id: "im703_lapu_lapu_2025",       name: "IRONMAN 70.3 Lapu-Lapu",      date: "2025-08-10", coachcox: 2599, dist: "MD", location: "Lapu-Lapu City, Philippines" },
];

function normalizeTime(t) {
  if (!t || t.trim() === "") return t;
  const parts = t.trim().split(":");
  if (parts.length === 2) return `0:${t.trim()}`;
  return t.trim();
}

function extractAthletes(bodyText) {
  const headerEnd = bodyText.indexOf("Run Time\n\n");
  if (headerEnd < 0) return [];
  const dataStart = headerEnd + "Run Time\n\n".length;
  let dataEnd = bodyText.indexOf("\n\n", dataStart);
  if (dataEnd < 0) dataEnd = bodyText.length;
  const dataStr = bodyText.slice(dataStart, dataEnd);
  const lines = dataStr.split("\n").filter((l) => l.trim());
  const athletes = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length !== 11) continue;
    const [name, gender, division, divRank, totalTime, overallRank, , , swim, bike, run] = parts;
    const g = gender === "Male" ? "M" : gender === "Female" ? "F" : gender;
    athletes.push({ rank: overallRank, name, gender: g, division, div_rank: divRank,
      total_time: normalizeTime(totalTime), swim: normalizeTime(swim), bike: normalizeTime(bike), run: normalizeTime(run) });
  }
  return athletes;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const race of FAILED) {
    const url = `https://www.coachcox.co.uk/imstats/race/${race.coachcox}/results/`;
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(3000);
      const bodyText = await page.evaluate(() => document.body.innerText);
      const athletes = extractAthletes(bodyText);
      if (athletes.length > 0) {
        const year = race.date.slice(0, 4);
        const dir = join(repoRoot, "master", year, race.id);
        mkdirSync(dir, { recursive: true });
        const tsv = ["Overall_Rank\tName\tGender\tDivision\tDiv_Rank\tTotal_Time\tSwim\tBike\tRun"];
        for (const a of athletes) {
          tsv.push(`${a.rank}\t${a.name}\t${a.gender}\t${a.division}\t${a.div_rank}\t${a.total_time}\t${a.swim}\t${a.bike}\t${a.run}`);
        }
        writeFileSync(join(dir, "default.tsv"), tsv.join("\n") + "\n");
        console.log(`✅ [${race.coachcox}] ${race.name}: ${athletes.length} athletes`);
      } else {
        console.log(`⚠️  [${race.coachcox}] ${race.name}: no data`);
      }
    } catch (err) {
      console.log(`❌ [${race.coachcox}] ${race.name}: ${err.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
}

main().catch(console.error);
