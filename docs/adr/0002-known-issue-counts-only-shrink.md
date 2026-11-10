# Known-issue counts only shrink: CI fails on improvements until the ledger is updated

Known issues (`checks/known-issues/tsv-lint.json`, `checks/known-issues/integrity.json`) are a to-fix list. They may only get shorter. Before this decision, an improved file kept its old allowance and could regress back up to it unnoticed, and entries for deleted files stayed forever. Now a check fails on any difference from the ledger: a regression, an improvement, or a stale entry. The failure tells you to run the update command, which rewrites the ledger to the new, lower counts.

## Considered Options

- **Fail on regressions only**: rejected. The allowance never tightens, so it hides future regressions up to the old count.
- **Auto-rewrite the ledger during CI**: rejected. CI must not mutate tracked files, and every shrink should be visible in a commit.

## Consequences

A commit that fixes data also has to commit the shrunken ledger. A check that fails because the data improved is deliberate. Don't "fix" it by going back to regression-only comparison.

Exceptions (`checks/exceptions/name-space.json`, `checks/exceptions/age-category.json`, `checks/exceptions/duplicate.json`) are correct data, not defects. They have no allowed counts and are not part of the ledger.

The ledgers and Exceptions lived at the repository root when this was decided; 6.0.0 moved them under `checks/`.
