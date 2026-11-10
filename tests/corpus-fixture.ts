/**
 * Test helper: the master/ files of a small corpus, in the layout of
 * scripts/lib/layout.js, written by the corpus serializers.
 */
import { editionFile, eventFile } from "../scripts/lib/corpus.js";
import { imagePath } from "../scripts/lib/layout.js";

export type FixtureEdition = { date: string; categories: Record<string, unknown>[] };
export type FixtureEvent = { id: string; editions: FixtureEdition[]; [field: string]: unknown };

/**
 * event.json (name defaults to the id), image.webp (a text stand-in) and
 * edition.json of every Event. TSVs and weather files are the caller's.
 */
export function corpusFiles(events: FixtureEvent[]): Record<string, string> {
  const files: Record<string, string> = {};
  for (const { editions, ...event } of events) {
    const ev = eventFile({ name: event.id, location_parts: { country: "JP" }, source: "https://example.com", ...event });
    files[ev.path] = ev.text;
    files[imagePath(event.id)] = `image of ${event.id}`;
    for (const edition of editions) {
      const ed = editionFile(event.id, edition as Parameters<typeof editionFile>[1]);
      files[ed.path] = ed.text;
    }
  }
  return files;
}
