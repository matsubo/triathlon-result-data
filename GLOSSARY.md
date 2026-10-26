# Triathlon result data

Triathlon race results from many publishers, reshaped into one normalized model. Downstream apps can then compare every race the same way.

## Language

### Races

**Event**:
A recurring race with a stable identity across years, such as `sado` or `ironman_world_championship_kona`.
_Avoid_: race, tournament, 大会 (in code and docs)

**Edition**:
One running of an Event on one date. An Edition is identified by its Event and its date, and that pair is unique. The year alone does not identify an Edition.
_Avoid_: year, instance, race

**Category**:
One result table within an Edition: a distance or division with its own course and its own result TSV. The word on its own always means this level, never an athlete's age group.
_Avoid_: program (JTU's word), subevent (IRONMAN's word), division, race

**Distance class**:
The size class of a Category: LD, MD, OD, SD, SS, DUATHLON, AQUATHLON or OTHER.
_Avoid_: distance (on its own; that means a Segment's kilometres), format

**Segment**:
One sport leg of a Category's course (swim, bike, run, trail running), together with its distance.
_Avoid_: leg, discipline, lap

### Results

**Athlete**:
One person's result row in one Category.
_Avoid_: participant, entrant, row, record

**Age category**:
The age-and-gender group an Athlete competes in within a Category, written canonically as `M25-29`, `F0-24` or `M65+`.
_Avoid_: category (on its own), age group, division

**Status**:
The outcome of an Athlete's race: finished, DNF, DNS, DSQ, TOV, OPEN or SKIP. OPEN means the Athlete finished outside the official ranking.
_Avoid_: result, state

**Column role**:
The meaning a Category assigns to one column of its result TSV, such as name, lap, overall rank or Age category.
_Avoid_: field mapping, column type

### Sources

**Import**:
Adding a new Edition, with its Categories and results, to the repository from a Results source.
_Avoid_: intake, ingest, scrape

**Results source**:
The publisher an Edition's results come from, such as IRONMAN, JTU, or a prepared TSV.
_Avoid_: provider, scraper, site

**Source reference**:
The id a Category has at its Results source (an IRONMAN subevent, a JTU program). With it, the Category's results can be fetched again.
_Avoid_: subevent id, uuid, program id (on their own)

### Data quality

**Known issue**:
A recorded defect in the data that is waiting to be fixed from the source. The number of Known issues may only go down.
_Avoid_: allowlist, baseline, exception

**Exception**:
A value that is correct but breaks a data rule, such as a foreign name that can't be split into family and given name. An Exception is permanent, not a defect.
_Avoid_: allowlist entry, known issue, whitelist
