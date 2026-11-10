/**
 * Repo port: access to repository files by repo-relative `/` paths.
 *
 * - `fsRepo(root)` reads and writes the working tree under `root`.
 * - `memoryRepo(files, base?)` keeps files in memory. With `base`, reads fall
 *   back to it and writes stay in memory (the `--dry-run` overlay).
 *
 * `generation()` grows with every write through the port (an overlay's also
 * with every write to its base), so readers that memoize what they parsed
 * from a repo (scripts/lib/corpus.js) can tell when it went stale.
 *
 * @typedef {object} Repo
 * @property {(path: string) => string | null} readText UTF-8 text, or null when the file does not exist
 * @property {(path: string) => Uint8Array | null} readBytes raw bytes, or null when the file does not exist
 * @property {(prefix: string) => string[]} list sorted repo-relative file paths under the directory `prefix`, recursive
 * @property {(path: string, text: string) => void} writeText create or replace a file (parent directories included)
 * @property {() => number} generation write counter; unchanged generation = unchanged files (as far as writes through ports go)
 *
 * @typedef {Repo & { files: () => Record<string, string | Uint8Array> }} MemoryRepo
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** @param {string} prefix */
function dirPrefix(prefix) {
  const p = prefix.replace(/^\.?\/+/, "").replace(/\/+$/, "");
  return p === "" ? "" : `${p}/`;
}

/**
 * @template T
 * @param {() => T} read
 * @returns {T | null}
 */
function orNullIfMissing(read) {
  try {
    return read();
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT")
      return null;
    throw err;
  }
}

/**
 * @param {string} root absolute path of the repository root
 * @returns {Repo}
 */
export function fsRepo(root) {
  let writes = 0;
  return {
    readText(path) {
      return orNullIfMissing(() => readFileSync(join(root, path), "utf8"));
    },
    readBytes(path) {
      return orNullIfMissing(() => readFileSync(join(root, path)));
    },
    list(prefix) {
      const dir = dirPrefix(prefix);
      /** @type {string[]} */
      const out = [];
      /** @param {string} rel */
      const walk = (rel) => {
        let entries;
        try {
          entries = readdirSync(join(root, rel), { withFileTypes: true });
        } catch (err) {
          const code = /** @type {NodeJS.ErrnoException} */ (err).code;
          if (code === "ENOENT" || code === "ENOTDIR") return;
          throw err;
        }
        for (const e of entries) {
          const child = `${rel}${e.name}`;
          if (e.isDirectory()) walk(`${child}/`);
          else if (e.isFile()) out.push(child);
        }
      };
      walk(dir);
      return out.sort();
    },
    writeText(path, text) {
      const abs = join(root, path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
      writes++;
    },
    generation() {
      return writes;
    },
  };
}

/**
 * @param {Record<string, string | Uint8Array>} [files] initial contents, keyed by repo-relative path
 * @param {Repo} [base] read-through fallback; never written to
 * @returns {MemoryRepo}
 */
export function memoryRepo(files = {}, base) {
  /** @type {Map<string, string | Uint8Array>} */
  const mem = new Map(Object.entries(files));
  let writes = 0;
  return {
    readText(path) {
      const own = mem.get(path);
      if (own === undefined) return base ? base.readText(path) : null;
      return typeof own === "string" ? own : new TextDecoder().decode(own);
    },
    readBytes(path) {
      const own = mem.get(path);
      if (own === undefined) return base ? base.readBytes(path) : null;
      return typeof own === "string" ? new TextEncoder().encode(own) : own;
    },
    list(prefix) {
      const dir = dirPrefix(prefix);
      const out = new Set(base ? base.list(prefix) : []);
      for (const p of mem.keys()) if (p.startsWith(dir)) out.add(p);
      return [...out].sort();
    },
    writeText(path, text) {
      mem.set(path, text);
      writes++;
    },
    generation() {
      return writes + (base ? base.generation() : 0);
    },
    files() {
      return Object.fromEntries(mem);
    },
  };
}
