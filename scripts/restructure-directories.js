import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

let movedFiles = 0;
let removedDirs = 0;
const raceInfoUpdates = [];

for (const event of raceInfo.events) {
  for (const edition of event.editions) {
    const year = edition.date.split("-")[0];
    const eventDir = join(repoRoot, "master", year, event.id);

    for (const category of edition.categories) {
      const currentTsv = category.result_tsv;
      const currentDir = dirname(join(repoRoot, currentTsv));

      // Derive new filename from category id, stripping event prefix
      let catSuffix = category.id.replace(`${event.id}_`, "");
      if (catSuffix === event.id) catSuffix = "default";
      const newTsvName = `${catSuffix}.tsv`;
      const newTsvPath = join(eventDir, newTsvName);
      const newTsvRelative = `master/${year}/${event.id}/${newTsvName}`;

      // Skip if already in correct location
      if (currentTsv === newTsvRelative) continue;

      // Create event directory if needed
      mkdirSync(eventDir, { recursive: true });

      // Move TSV file
      const currentTsvAbs = join(repoRoot, currentTsv);
      if (existsSync(currentTsvAbs)) {
        renameSync(currentTsvAbs, newTsvPath);
        console.log(`  MOVE: ${currentTsv} -> ${newTsvRelative}`);
        movedFiles++;
      }

      // Move weather file if it's in the old directory (not the event dir)
      const oldWeatherPath = join(currentDir, "weather-data.json");
      const newWeatherPath = join(eventDir, "weather-data.json");
      if (
        existsSync(oldWeatherPath) &&
        !existsSync(newWeatherPath) &&
        currentDir !== eventDir
      ) {
        renameSync(oldWeatherPath, newWeatherPath);
        console.log(
          `  MOVE: weather-data.json from ${currentDir} -> ${eventDir}`,
        );
        movedFiles++;

        // Update weather_file path for all categories in this edition
        const newWeatherRelative = `master/${year}/${event.id}/weather-data.json`;
        if (edition.weather_file !== newWeatherRelative) {
          edition.weather_file = newWeatherRelative;
        }
      }

      // Update race-info.json reference
      category.result_tsv = newTsvRelative;
      raceInfoUpdates.push(`${currentTsv} -> ${newTsvRelative}`);

      // Remove old directory if empty
      if (existsSync(currentDir) && currentDir !== eventDir) {
        const remaining = readdirSync(currentDir);
        if (remaining.length === 0) {
          rmSync(currentDir, { recursive: true });
          console.log(`  RMDIR: ${currentDir}`);
          removedDirs++;
        }
      }
    }
  }
}

// Write updated race-info.json
writeFileSync(
  join(repoRoot, "race-info.json"),
  `${JSON.stringify(raceInfo, null, 2)}\n`,
);

console.log(`\nMoved ${movedFiles} files, removed ${removedDirs} empty dirs.`);
console.log(`Updated ${raceInfoUpdates.length} paths in race-info.json.`);
