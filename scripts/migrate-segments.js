import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const raceInfoPath = join(__dirname, "..", "race-info.json");

const content = readFileSync(raceInfoPath, "utf-8");
const data = JSON.parse(content);

// Manual overrides for known duathlon entries where swim_distance is actually a run
const duathlonOverrides = new Set(["tateyama_duathlon", "tateyama_sprint"]);

let totalCategories = 0;
let migratedCategories = 0;

const migratedEvents = data.events.map((event) => ({
  ...event,
  editions: event.editions.map((edition) => ({
    ...edition,
    categories: edition.categories.map((category) => {
      totalCategories++;

      const { swim_distance, bike_distance, run_distance, ...rest } = category;

      // Skip if already migrated
      if (category.segments) {
        console.log(`  SKIP (already has segments): ${category.id}`);
        return category;
      }

      const segments = [];
      const isDuathlonOverride = duathlonOverrides.has(category.id);

      // For duathlon overrides, swim_distance is actually a run
      if (swim_distance > 0) {
        segments.push({
          sport: isDuathlonOverride ? "run" : "swim",
          distance: swim_distance,
        });
      }

      if (bike_distance > 0) {
        segments.push({ sport: "bike", distance: bike_distance });
      }

      if (run_distance > 0) {
        segments.push({ sport: "run", distance: run_distance });
      }

      // Handle teganuma_duathlon special case: run 5km, bike 20km, run 5km
      if (
        category.id === "teganuma_duathlon" &&
        category.distance === "DUATHLON"
      ) {
        segments.length = 0;
        segments.push(
          { sport: "run", distance: 5 },
          { sport: "bike", distance: 20 },
          { sport: "run", distance: 5 },
        );
      }

      // Handle niijima 2023 duathlon: run 2km, bike 40km, run 10km
      if (category.id === "niijima" && category.distance === "DUATHLON") {
        segments.length = 0;
        segments.push(
          { sport: "run", distance: 2 },
          { sport: "bike", distance: 40 },
          { sport: "run", distance: 10 },
        );
      }

      migratedCategories++;
      console.log(
        `  MIGRATED: ${category.id} -> [${segments.map((s) => `${s.sport}:${s.distance}km`).join(", ")}]`,
      );

      return { ...rest, segments };
    }),
  })),
}));

const result = { events: migratedEvents };
writeFileSync(raceInfoPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`\nTotal categories: ${totalCategories}`);
console.log(`Migrated: ${migratedCategories}`);
console.log("Done. Run 'bun run check' to format.");
