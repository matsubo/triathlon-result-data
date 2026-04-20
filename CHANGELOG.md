# Changelog

## 5.0.1

- Fix OCR error in Yokohama 2025 age category codes: replaced 1314 occurrences of `N##-##` with `M##-##` across `master/2025/yokohama/default.tsv` (1102) and `master/2025/yokohama/sprint.tsv` (212). All affected entries were male (男), confirming `N` was a misread of `M`.
