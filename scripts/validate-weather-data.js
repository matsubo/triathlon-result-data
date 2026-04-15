import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findWeatherDataFiles(dir) {
  const files = [];

  function traverse(currentDir) {
    try {
      const items = readdirSync(currentDir);

      for (const item of items) {
        const fullPath = join(currentDir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (item === "weather-data.json") {
          files.push(fullPath);
        }
      }
    } catch (_error) {
      // Skip directories we can't read
    }
  }

  traverse(dir);
  return files.sort();
}

function validateWeatherSchema(schemaPath) {
  console.log("🔍 Validating weather schema file...");

  try {
    const schemaContent = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    // Create AJV instance and try to compile the schema
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.compile(schema);

    console.log("✅ Weather schema is valid");
    return schema;
  } catch (error) {
    console.error("❌ ERROR: weather-schema.json is invalid:", error.message);
    process.exit(1);
  }
}

function validateWeatherDataFiles(schema, files) {
  if (files.length === 0) {
    console.log("⚠️  No weather-data.json files found");
    return;
  }

  console.log(`🧪 Starting validation of ${files.length} files...`);
  console.log("");

  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let validFiles = 0;
  let invalidFiles = 0;
  const validList = [];
  const invalidList = [];
  const errorDetails = [];

  for (const file of files) {
    console.log(`🔍 Validating: ${file}`);

    try {
      // Check if file exists and is readable
      const content = readFileSync(file, "utf-8");

      // Check if file is valid JSON
      let data;
      try {
        data = JSON.parse(content);
      } catch (jsonError) {
        console.log(`❌ ERROR: Invalid JSON syntax in ${file}`);
        invalidList.push(file);
        errorDetails.push(
          `Invalid JSON syntax: ${file} - ${jsonError.message}`,
        );
        invalidFiles++;
        continue;
      }

      // Validate against schema
      const isValid = validate(data);

      if (isValid) {
        console.log(`✅ Valid: ${file}`);
        validList.push(file);
        validFiles++;
      } else {
        console.log(`❌ Invalid: ${file}`);
        const errors = validate.errors
          .map((err) => `    ${err.instancePath || "root"}: ${err.message}`)
          .join("\n");
        console.log(errors);
        invalidList.push(file);
        errorDetails.push(`Schema validation failed: ${file}`);
        errorDetails.push(errors);
        invalidFiles++;
      }
      console.log("");
    } catch (error) {
      console.log(`❌ ERROR: File not found or not readable: ${file}`);
      invalidList.push(file);
      errorDetails.push(`File error: ${file} - ${error.message}`);
      invalidFiles++;
      console.log("");
    }
  }

  // Generate summary report
  console.log("📊 VALIDATION SUMMARY");
  console.log("====================");
  console.log(`Total files processed: ${files.length}`);
  console.log(`✅ Valid files: ${validFiles}`);
  console.log(`❌ Invalid files: ${invalidFiles}`);
  console.log("");

  if (validFiles > 0) {
    console.log("✅ VALID FILES:");
    validList.forEach((file) => console.log(`  - ${file}`));
    console.log("");
  }

  if (invalidFiles > 0) {
    console.log("❌ INVALID FILES:");
    invalidList.forEach((file) => console.log(`  - ${file}`));
    console.log("");
    console.log("📋 ERROR DETAILS:");
    console.log("==================");
    errorDetails.forEach((detail) => console.log(detail));
    console.log("");
  }

  // Final result
  if (invalidFiles > 0) {
    console.log(
      `❌ VALIDATION FAILED: ${invalidFiles} out of ${files.length} files are invalid`,
    );
    console.log("");
    console.log("💡 TROUBLESHOOTING TIPS:");
    console.log(
      "  1. Check the WEATHER_DATA_RULES.md file for formatting guidelines",
    );
    console.log(
      "  2. Ensure all required fields are present and have correct data types",
    );
    console.log(
      "  3. Check that weatherCode/windDirectionCode values are from the allowed enums",
    );
    console.log(
      "  4. Verify numeric ranges (humidity: 0-100, windSpeed: ≥0, etc.)",
    );
    process.exit(1);
  } else {
    console.log(
      `🎉 SUCCESS: All ${files.length} weather data files are valid!`,
    );
    console.log("");
    console.log(
      "✨ Great job maintaining data quality! All files passed schema validation.",
    );
  }
}

// Main execution
try {
  const repoRoot = resolve(__dirname, "..");
  const schemaPath = join(repoRoot, "weather-schema.json");

  // Validate schema first
  const schema = validateWeatherSchema(schemaPath);

  // Find weather data files
  console.log("🔍 Searching for weather-data.json files...");
  const masterDir = join(repoRoot, "master");
  const weatherFiles = findWeatherDataFiles(masterDir);

  console.log(`📊 Found ${weatherFiles.length} weather data files:`);
  weatherFiles.forEach((file) => console.log(`  - ${file}`));
  console.log("");

  // Validate weather data files
  validateWeatherDataFiles(schema, weatherFiles);
} catch (error) {
  console.error("❌ Validation script failed:", error.message);
  process.exit(1);
}
