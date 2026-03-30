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

function testNoFullWidthSpaces() {
	const masterDir = resolve(__dirname, "..", "master");
	const tsvFiles = getAllTsvFiles(masterDir);
	const errors = [];

	for (const filePath of tsvFiles) {
		const content = readFileSync(filePath, "utf-8");
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes("\u3000")) {
				const relativePath = filePath.replace(
					`${resolve(__dirname, "..")}/`,
					"",
				);
				errors.push(`${relativePath}:${i + 1}`);
				break;
			}
		}
	}

	if (errors.length > 0) {
		const formatted = errors.join("\n");
		throw new Error(
			`Full-width spaces (U+3000) found in TSV files:\n${formatted}\nUse half-width spaces instead.`,
		);
	}

	console.log(`✅ No full-width spaces in ${tsvFiles.length} TSV files`);
}

try {
	console.log("🧪 Running TSV lint tests...");
	testNoFullWidthSpaces();
	console.log("🎉 All TSV lint tests passed!");
} catch (error) {
	console.error("❌ Test failed:", error.message);
	process.exit(1);
}
