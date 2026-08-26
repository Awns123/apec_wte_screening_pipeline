const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const manifestPath = path.join(root, "SHA256SUMS.txt");

if (!fs.existsSync(manifestPath)) {
  throw new Error("Missing SHA256SUMS.txt");
}

const lines = fs
  .readFileSync(manifestPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean);

const problems = [];
for (const line of lines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/i);
  if (!match) {
    problems.push("Malformed manifest line: " + line);
    continue;
  }
  const expected = match[1].toLowerCase();
  const relativePath = match[2];
  const fullPath = path.join(root, ...relativePath.split("/"));
  if (!fs.existsSync(fullPath)) {
    problems.push("Missing: " + relativePath);
    continue;
  }
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(fullPath))
    .digest("hex");
  if (actual !== expected) {
    problems.push("Hash mismatch: " + relativePath);
  }
}

if (problems.length) {
  throw new Error(problems.join("\n"));
}

console.log("PASS: verified " + lines.length + " repository files");
