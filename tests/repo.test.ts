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
      expect(repo.generation()).toBe(0);
      repo.writeText("master/b/2026-01-01/b.tsv", "b\n");
      repo.writeText("master/a/2026-01-01/x.tsv", "a\n");
      repo.writeText("top.json", "{}\n");
      expect(repo.generation()).toBe(3);

      expect(repo.readText("master/a/2026-01-01/x.tsv")).toBe("a\n");
      expect(repo.readBytes("top.json")).toEqual(new TextEncoder().encode("{}\n"));
      expect(readFileSync(join(root, "top.json"), "utf8")).toBe("{}\n");
      expect(repo.readText("master/missing.tsv")).toBeNull();
      expect(repo.readBytes("master/missing.tsv")).toBeNull();
      expect(repo.list("master/")).toEqual(["master/a/2026-01-01/x.tsv", "master/b/2026-01-01/b.tsv"]);
      expect(repo.list("master")).toEqual(repo.list("master/"));
      expect(repo.list("nope/")).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("memoryRepo", () => {
  test("holds text and bytes in memory and reports them through files()", () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const repo = memoryRepo({ "top.json": "{}\n", "master/x/image.webp": bytes });
    repo.writeText("master/x/2026-01-01/x.tsv", "h\n");
    expect(repo.readText("master/x/2026-01-01/x.tsv")).toBe("h\n");
    expect(repo.readText("absent.txt")).toBeNull();
    expect(repo.readBytes("master/x/image.webp")).toBe(bytes);
    expect(repo.readText("master/x/image.webp")).toBe("RIFF");
    expect(repo.readBytes("top.json")).toEqual(new TextEncoder().encode("{}\n"));
    expect(repo.list("master/x/2026-01-01/")).toEqual(["master/x/2026-01-01/x.tsv"]);
    expect(repo.files()).toEqual({
      "top.json": "{}\n",
      "master/x/image.webp": bytes,
      "master/x/2026-01-01/x.tsv": "h\n",
    });
  });

  test("as an overlay, reads fall back to the base and writes stay in memory", () => {
    const base = memoryRepo({ "a.txt": "base a", "dir/b.txt": "base b" });
    const overlay = memoryRepo({}, base);
    overlay.writeText("a.txt", "new a");
    overlay.writeText("dir/c.txt", "c");

    expect(overlay.readText("a.txt")).toBe("new a");
    expect(overlay.readText("dir/b.txt")).toBe("base b");
    expect(overlay.readBytes("dir/b.txt")).toEqual(new TextEncoder().encode("base b"));
    expect(overlay.list("dir/")).toEqual(["dir/b.txt", "dir/c.txt"]);
    expect(overlay.files()).toEqual({ "a.txt": "new a", "dir/c.txt": "c" });
    expect(base.readText("a.txt")).toBe("base a");
    expect(base.readText("dir/c.txt")).toBeNull();
  });

  test("generation grows with every write, an overlay's also with its base's", () => {
    const base = memoryRepo();
    const overlay = memoryRepo({}, base);
    const before = overlay.generation();
    overlay.writeText("a.txt", "a");
    const afterOwn = overlay.generation();
    base.writeText("b.txt", "b");
    expect(afterOwn).toBeGreaterThan(before);
    expect(overlay.generation()).toBeGreaterThan(afterOwn);
    expect(base.generation()).toBe(1);
  });
});
