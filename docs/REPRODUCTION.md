# Reproduction

## One-command Check

```powershell
node verify_integrity.js
node verify_reproduction.js
```

If npm is available, `npm test` runs the same two commands. The integrity step checks `SHA256SUMS.txt`; the reproduction step performs the isolated analysis rerun.

## Direct Check

```powershell
node verify_reproduction.js
```

The verifier:

1. creates a new temporary directory;
2. copies the eight historical scripts and compact input snapshot;
3. runs `run_final_integrated_analysis.js`;
4. runs `build_integrated_report_2026_05_11.js`;
5. compares every generated output with `reference_outputs/`;
6. reports missing, extra, or hash-different files;
7. deletes the temporary directory.

Expected result:

```text
PASS: reproduced 26 files exactly
```

The test is deterministic for the frozen input snapshot. It does not download live data.
