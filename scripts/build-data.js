import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { buildAthlete } from "./lib/build-athlete.js";
import { parseTsv } from "./lib/parse-tsv.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

// Read inputs
const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

console.log("🔨 Building normalized data...");

let totalAthletes = 0;
let totalCategories = 0;
const warnings = [];

const events = raceInfo.events.map((event) => ({
  id: event.id,
  name: event.name,
  location: event.location,
  image: event.image,
  source: event.source,
  editions: event.editions.map((edition) => {
    let weather = null;
    if (edition.weather_file) {
      try {
        weather = JSON.parse(
          readFileSync(join(repoRoot, edition.weather_file), "utf-8"),
        );
      } catch (err) {
        if (err.code === "ENOENT") {
          warnings.push(`Weather file not found: ${edition.weather_file}`);
        } else {
          throw err;
        }
      }
    }

    return {
      date: edition.date,
      weather,
      categories: edition.categories.map((category) => {
        totalCategories++;

        // Read TSV
        let athletes = [];

        try {
          const tsvContent = readFileSync(
            join(repoRoot, category.result_tsv),
            "utf-8",
          );
          const { headers, rows } = parseTsv(tsvContent);

          // Validate that all mapped headers exist in TSV
          const allMappedHeaders = [
            ...category.meta_columns.map((mc) => mc.header),
            ...category.segments.flatMap((seg) =>
              seg.columns.map((col) => col.header),
            ),
          ];
          for (const h of allMappedHeaders) {
            if (!headers.includes(h)) {
              warnings.push(
                `Header mismatch in ${category.result_tsv}: column "${h}" not found in TSV headers`,
              );
            }
          }

          athletes = rows
            .map((row) =>
              buildAthlete(row, category.meta_columns, category.segments),
            )
            .filter((a) => a.name !== "");

          totalAthletes += athletes.length;
        } catch (err) {
          if (err.code === "ENOENT") {
            warnings.push(`TSV file not found: ${category.result_tsv}`);
          } else {
            throw err;
          }
        }

        return {
          id: category.id,
          name: category.name,
          distance: category.distance,
          description: category.description,
          segments: category.segments.map((seg) => ({
            sport: seg.sport,
            distance_km: seg.distance,
          })),
          athletes,
        };
      }),
    };
  }),
}));

const data = { events };

// Write output
const distDir = join(repoRoot, "dist");
mkdirSync(distDir, { recursive: true });

const outputPath = join(distDir, "data.json");
writeFileSync(outputPath, `${JSON.stringify(data)}\n`);

console.log(
  `✅ Built ${totalCategories} categories, ${totalAthletes} athletes`,
);

if (warnings.length > 0) {
  console.log(`\n⚠️  ${warnings.length} warnings:`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// Validate against schema
console.log("\n🔍 Validating against schema...");
const schema = JSON.parse(
  readFileSync(join(repoRoot, "result-schema.json"), "utf-8"),
);
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(data);

if (valid) {
  console.log("✅ Output validates against result-schema.json");
} else {
  console.error("❌ Validation errors:");
  for (const err of validate.errors.slice(0, 10)) {
    console.error(`  ${err.instancePath}: ${err.message}`);
  }
  process.exit(1);
}

const { size } = statSync(outputPath);
const sizeMB = (size / 1024 / 1024).toFixed(1);
console.log(`\n📦 Output: dist/data.json (${sizeMB} MB)`);
