import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { readCorpus } from "../scripts/lib/corpus.js";
import { fsRepo } from "../scripts/lib/repo.js";

const repo = fsRepo(resolve(import.meta.dirname, ".."));

describe("Image Assets Integrity", () => {
  test("every Event's image.webp exists and is a WebP file", () => {
    // A missing image.webp is also a missing-image layout finding; a stray
    // file under master/ an unexpected-file one (tests/tsv-lint.test.ts).
    const bad: string[] = [];
    for (const event of readCorpus(repo).events) {
      const bytes = repo.readBytes(event.image);
      const tag = (from: number) => (bytes ? new TextDecoder().decode(bytes.subarray(from, from + 4)) : "");
      if (!bytes) bad.push(`${event.id}: ${event.image} is missing`);
      else if (tag(0) !== "RIFF" || tag(8) !== "WEBP") bad.push(`${event.id}: ${event.image} is not a WebP file`);
    }
    expect(bad).toEqual([]);
  });

  test("no two Events share a byte-identical image.webp", () => {
    // Every Event needs its own image; a copied placeholder is reuse
    // (the Import module refuses one for a new Event, this covers the rest).
    const byHash = new Map<string, string[]>();
    for (const event of readCorpus(repo).events) {
      const bytes = repo.readBytes(event.image);
      if (!bytes) continue;
      const hash = createHash("sha1").update(bytes).digest("hex");
      byHash.set(hash, [...(byHash.get(hash) ?? []), event.id]);
    }
    const shared = [...byHash.values()].filter((ids) => ids.length > 1).map((ids) => ids.join(", "));
    expect(shared).toEqual([]);
  });
});
