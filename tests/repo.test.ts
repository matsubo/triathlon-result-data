import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fsRepo, memoryRepo } from "../scripts/lib/repo.js";

describe("fsRepo", () => {
  test("writes, reads back, lists recursively and returns null for missing files", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-test-"));
    try {
      const repo = fsRepo(root);
      repo.writeText("master/2026/b/default.tsv", "b\n");
      repo.writeText("master/2026/a/x.tsv", "a\n");
      repo.writeText("race-info.json", "{}\n");

      expect(repo.readText("master/2026/a/x.tsv")).toBe("a\n");
      expect(readFileSync(join(root, "race-info.json"), "utf8")).toBe("{}\n");
      expect(repo.readText("master/2026/missing.tsv")).toBeNull();
      expect(repo.list("master/")).toEqual([
        "master/2026/a/x.tsv",
        "master/2026/b/default.tsv",
      ]);
      expect(repo.list("master")).toEqual(repo.list("master/"));
      expect(repo.list("nope/")).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("memoryRepo", () => {
  test("holds files in memory and reports them through files()", () => {
    const repo = memoryRepo({ "race-info.json": "{}\n" });
    repo.writeText("master/2026/x/default.tsv", "h\n");
    expect(repo.readText("master/2026/x/default.tsv")).toBe("h\n");
    expect(repo.readText("absent.txt")).toBeNull();
    expect(repo.list("master/2026/")).toEqual(["master/2026/x/default.tsv"]);
    expect(repo.files()).toEqual({
      "race-info.json": "{}\n",
      "master/2026/x/default.tsv": "h\n",
    });
  });

  test("as an overlay, reads fall back to the base and writes stay in memory", () => {
    const base = memoryRepo({ "a.txt": "base a", "dir/b.txt": "base b" });
    const overlay = memoryRepo({}, base);
    overlay.writeText("a.txt", "new a");
    overlay.writeText("dir/c.txt", "c");

    expect(overlay.readText("a.txt")).toBe("new a");
    expect(overlay.readText("dir/b.txt")).toBe("base b");
    expect(overlay.list("dir/")).toEqual(["dir/b.txt", "dir/c.txt"]);
    expect(overlay.files()).toEqual({ "a.txt": "new a", "dir/c.txt": "c" });
    expect(base.readText("a.txt")).toBe("base a");
    expect(base.readText("dir/c.txt")).toBeNull();
  });
});
