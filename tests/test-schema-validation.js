import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function validateRaceInfo() {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "race-info-schema.json"), "utf-8"),
  );
  const data = JSON.parse(
    readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
  );

  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  if (!validate(data)) {
    const errors = validate.errors
      .map((e) => `  ${e.instancePath || "(root)"} ${e.message}`)
      .join("\n");
    throw new Error(
      `race-info.json does not match race-info-schema.json:\n${errors}`,
    );
  }

  console.log("✅ race-info.json matches race-info-schema.json");
}

// Run
try {
  console.log("🧪 Running schema validation tests...");
  validateRaceInfo();
  console.log("🎉 All schema validation tests passed!");
} catch (error) {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
}
