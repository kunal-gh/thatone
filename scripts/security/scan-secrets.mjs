import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".pdf",
  ".docx",
  ".zip",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".mp4"
]);

const RULES = [
  { name: "OpenAI project key", pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g },
  { name: "OpenAI user key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "GitHub personal token", pattern: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { name: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "TMDB bearer token value", pattern: /TMDB_BEARER_TOKEN\s*=\s*[A-Za-z0-9._-]{20,}/g },
  { name: "OMDb key value", pattern: /OMDB_API_KEY\s*=\s*[A-Za-z0-9]{8,}/g }
];

function isBinaryFile(path) {
  return BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

function readTrackedFiles() {
  const tracked = execFileSync("git", ["ls-files", "--cached"], { encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" });
  return [...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)].filter(Boolean);
}

const findings = [];

for (const file of readTrackedFiles()) {
  if (isBinaryFile(file)) continue;

  let text;

  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (text.includes("\u0000")) continue;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!rule.pattern.test(line)) {
        rule.pattern.lastIndex = 0;
        continue;
      }
      if (line.includes("=YOUR_") || line.endsWith("=") || line.includes("placeholder")) {
        rule.pattern.lastIndex = 0;
        continue;
      }
      findings.push(`${file}:${index + 1} ${rule.name}`);
      rule.pattern.lastIndex = 0;
    }
  });
}

if (findings.length > 0) {
  console.error("Potential secrets detected:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Secret scan passed on tracked and untracked project files.");
