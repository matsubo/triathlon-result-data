# Source references live on Categories in race-info.json

To re-fetch a Category's results, you need its Source reference: the IRONMAN subevent UUID, or the JTU program id. These used to live in per-batch handoff files (`scripts/*-subevents.json`, `scripts/ironman-subevent-ids-*.json`). Those files went stale, nothing read them after their batch, and one Import could only find the Edition the previous script had written by reading `race-info.json` back. We now store the Source reference on each Category in `race-info.json`, so the identity of the source travels with the data it produced.

## Considered Options

- **Per-batch handoff files**: rejected. They pile up, and nothing ties them to Categories.
- **A separate registry file**: rejected. It is a second place to keep in sync with `race-info.json`, and there was already precedent for source ids in `race-info.json` (Edition-level `event_id` for JTU).

## Consequences

`race-info.json` now carries provenance metadata that the normalized output does not expose. Don't move it out to "clean up" the downstream-facing file.
