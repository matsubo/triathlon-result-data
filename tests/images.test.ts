import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const repoRoot = resolve(import.meta.dirname, "..");
const raceInfoPath = join(repoRoot, "race-info.json");
const imagesDir = join(repoRoot, "images");

// Allowlist for images that are valid to exist but not directly referenced in events.
const ALLOWED_IMAGES = new Set([
  "images/dummy.webp"
]);

interface Event {
  id: string;
  image?: string;
}

interface RaceInfo {
  events: Event[];
}

describe("Image Assets Integrity", () => {
  const content = readFileSync(raceInfoPath, "utf-8");
  const raceInfo = JSON.parse(content) as RaceInfo;
  
  test("every event has a valid referenced image file that exists", () => {
    const missing: string[] = [];
    
    for (const event of raceInfo.events) {
      if (event.image) {
        const fullPath = join(repoRoot, event.image);
        if (!existsSync(fullPath)) {
          missing.push(`${event.id}: missing "${event.image}"`);
        }
      } else {
        missing.push(`${event.id}: no image field defined`);
      }
    }
    
    expect(missing).toEqual([]);
  });

  test("no orphaned images exist in the images/ directory", () => {
    const referencedImages = new Set<string>();
    for (const event of raceInfo.events) {
      if (event.image) {
        referencedImages.add(event.image);
      }
    }

    const actualImages = readdirSync(imagesDir)
      .filter((file) => file.endsWith(".webp"))
      .map((file) => `images/${file}`);

    const orphaned: string[] = [];
    for (const image of actualImages) {
      if (!referencedImages.has(image) && !ALLOWED_IMAGES.has(image)) {
        orphaned.push(image);
      }
    }

    expect(orphaned).toEqual([]);
  });
});
