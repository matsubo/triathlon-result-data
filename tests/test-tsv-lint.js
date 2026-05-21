import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getAllTsvFiles(dir) {
  const files = [];

  function traverse(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith(".tsv")) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files.sort();
}

function relPath(filePath) {
  return filePath.replace(`${resolve(__dirname, "..")}/`, "");
}

function testNoFullWidthSpaces() {
  const masterDir = resolve(__dirname, "..", "master");
  const tsvFiles = getAllTsvFiles(masterDir);
  const errors = [];

  for (const filePath of tsvFiles) {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("　")) {
        errors.push(`${relPath(filePath)}:${i + 1}`);
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Full-width spaces (U+3000) found in TSV files:\n${errors.join("\n")}\nUse half-width spaces instead.`,
    );
  }

  console.log(`✅ No full-width spaces in ${tsvFiles.length} TSV files`);
}

function testNoRepeatedHeaders() {
  const masterDir = resolve(__dirname, "..", "master");
  const tsvFiles = getAllTsvFiles(masterDir);
  const errors = [];

  for (const filePath of tsvFiles) {
    const lines = readFileSync(filePath, "utf-8").split("\n");
    if (lines.length < 3) continue;
    const header = lines[0];
    const headerCells = header.split("\t");
    const headerSig3 = headerCells.slice(0, 3).join("\t");

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cells = line.split("\t");
      const sig3 = cells.slice(0, 3).join("\t");
      if (sig3 === headerSig3) {
        errors.push(
          `${relPath(filePath)}:${i + 1} (header row repeated mid-file)`,
        );
        break;
      }
      if (
        cells.length === 1 &&
        cells[0] === "総合" &&
        i + 1 < lines.length &&
        lines[i + 1].startsWith("順位\t")
      ) {
        errors.push(
          `${relPath(filePath)}:${i + 1} (PDF page-break header artifact)`,
        );
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Repeated header rows found in TSV files (PDF extraction artifacts):\n${errors.join("\n")}\nRemove these rows.`,
    );
  }

  console.log(`✅ No repeated headers in ${tsvFiles.length} TSV files`);
}

function testNoRelaySections() {
  const masterDir = resolve(__dirname, "..", "master");
  const tsvFiles = getAllTsvFiles(masterDir);
  const errors = [];

  const RELAY_MARKERS = [
    "チーム名",
    "スイム氏名",
    "バイク氏名",
    "ラン氏名",
    "団体順位",
  ];

  for (const filePath of tsvFiles) {
    const lines = readFileSync(filePath, "utf-8").split("\n");
    if (lines.length < 2) continue;
    const headerCells = lines[0].split("\t");
    if (RELAY_MARKERS.some((m) => headerCells.includes(m))) continue;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cells = line.split("\t");
      if (RELAY_MARKERS.some((m) => cells.includes(m))) {
        errors.push(
          `${relPath(filePath)}:${i + 1} (relay header found mid-file)`,
        );
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Stray relay-section headers found in non-relay TSV files:\n${errors.join("\n")}\nRelay results are out of scope; remove them.`,
    );
  }

  console.log(`✅ No stray relay sections in ${tsvFiles.length} TSV files`);
}

function testRankUniqueness() {
  const masterDir = resolve(__dirname, "..", "master");
  const tsvFiles = getAllTsvFiles(masterDir);
  const errors = [];

  const RANK_HEADERS = ["総合順位", "順位", "Pos", "Overall_Rank", "Rank"];

  for (const filePath of tsvFiles) {
    const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    if (lines.length < 5) continue;
    const headerCells = lines[0].split("\t");
    if (!RANK_HEADERS.includes(headerCells[0])) continue;

    const seen = new Map();
    let duplicates = 0;
    const exampleRanks = [];
    for (let i = 1; i < lines.length; i++) {
      const rank = lines[i].split("\t")[0];
      if (!/^\d+$/.test(rank)) continue;
      const count = (seen.get(rank) || 0) + 1;
      seen.set(rank, count);
      if (count === 2) {
        duplicates++;
        if (exampleRanks.length < 3) exampleRanks.push(rank);
      }
    }

    if (duplicates >= 5) {
      errors.push(
        `${relPath(filePath)} — ${duplicates} duplicate numeric ranks in 総合順位 column (e.g. ${exampleRanks.join(", ")}). File likely contains multiple sub-sections that should be split or re-ranked.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Non-unique overall ranks found in TSV files:\n${errors.join("\n")}\nSplit multi-distance/multi-category sections into separate TSV files, or re-rank by total time.`,
    );
  }

  console.log(
    `✅ Overall rank is unique in ${getAllTsvFiles(resolve(__dirname, "..", "master")).length} TSV files`,
  );
}

function testIronmanRequiredColumns() {
  const masterDir = resolve(__dirname, "..", "master");
  const tsvFiles = getAllTsvFiles(masterDir);
  const errors = [];

  // ContactId is a hard requirement for IRONMAN imports (see commit
  // cd81f8e). Country and Status round out the canonical 14-column
  // layout — see master/2026/im703_valencia_2026/default.tsv for the
  // reference:
  //   ContactId | Overall_Rank | Name | Gender | Division | Div_Rank |
  //   Total_Time | Swim | T1 | Bike | T2 | Run | Country | Status
  const REQUIRED = ["ContactId", "Country", "Status"];

  for (const filePath of tsvFiles) {
    // Match master/<year>/(im703_*|ironman_*)/*.tsv
    const rel = relPath(filePath);
    if (!/^master\/\d+\/(im703|ironman)_[^/]+\//.test(rel)) continue;

    const lines = readFileSync(filePath, "utf-8").split("\n");
    if (lines.length < 2) continue;
    const headerCells = lines[0].split("\t");
    const missing = REQUIRED.filter((c) => !headerCells.includes(c));
    if (missing.length > 0) {
      errors.push(`${rel} — missing: ${missing.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `IRONMAN / IRONMAN 70.3 TSVs missing required columns:\n${errors.join(
        "\n",
      )}\nIRONMAN TSVs must include ContactId, Country, and Status. Re-fetch from the CoachCox JSON API (see master/2026/im703_valencia_2026/default.tsv for the 14-column reference).`,
    );
  }

  const ironmanFiles = tsvFiles.filter((p) =>
    /^master\/\d+\/(im703|ironman)_[^/]+\//.test(relPath(p)),
  );
  console.log(
    `✅ All ${ironmanFiles.length} IRONMAN/im703 TSVs include ContactId/Country/Status`,
  );
}

try {
  console.log("🧪 Running TSV lint tests...");
  testNoFullWidthSpaces();
  testNoRepeatedHeaders();
  testNoRelaySections();
  testRankUniqueness();
  testIronmanRequiredColumns();
  console.log("🎉 All TSV lint tests passed!");
} catch (error) {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
}
