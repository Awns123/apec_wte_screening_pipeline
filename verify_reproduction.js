const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = __dirname;
const referenceRoot = path.join(root, "reference_outputs");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apec-wte-repro-"));

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function copyIntoTemporary(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(temporaryRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

try {
  for (const relativePath of [
    "scripts",
    "01_raw_data",
    "02_processed_data",
    path.join("05_analysis_results", "models"),
  ]) {
    copyIntoTemporary(relativePath);
  }

  for (const script of [
    "run_final_integrated_analysis.js",
    "build_integrated_report_2026_05_11.js",
  ]) {
    childProcess.execFileSync(
      process.execPath,
      [path.join(temporaryRoot, "scripts", script)],
      { cwd: temporaryRoot, stdio: "inherit" },
    );
  }

  const referenceFiles = listFiles(referenceRoot)
    .map((file) => path.relative(referenceRoot, file))
    .sort();
  const generatedFiles = [
    ...listFiles(path.join(temporaryRoot, "04_metadata_sources")),
    ...listFiles(path.join(temporaryRoot, "05_analysis_results", "final_2026-05-05")),
    ...listFiles(path.join(temporaryRoot, "05_analysis_results", "final_2026-05-11")),
  ]
    .map((file) => path.relative(temporaryRoot, file))
    .sort();

  const problems = [];
  const referenceSet = new Set(referenceFiles);
  const generatedSet = new Set(generatedFiles);

  for (const relativePath of referenceFiles) {
    if (!generatedSet.has(relativePath)) {
      problems.push("Missing generated file: " + relativePath);
      continue;
    }
    const expected = hashFile(path.join(referenceRoot, relativePath));
    const actual = hashFile(path.join(temporaryRoot, relativePath));
    if (expected !== actual) {
      problems.push("Hash mismatch: " + relativePath);
    }
  }
  for (const relativePath of generatedFiles) {
    if (!referenceSet.has(relativePath)) {
      problems.push("Unexpected generated file: " + relativePath);
    }
  }

  if (problems.length) {
    throw new Error(problems.join("\n"));
  }
  console.log("PASS: reproduced " + referenceFiles.length + " files exactly");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
