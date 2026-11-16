import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const expected = pkg.version;
const raw = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? process.env.npm_package_version ?? "";
const actual = String(raw).trim().replace(/^v/, "");

if (!actual) {
  console.error("Missing version. Pass a tag/version, e.g. npm run check:version -- 0.2.0");
  process.exit(1);
}
if (actual !== expected) {
  console.error(`Version mismatch: tag/arg ${actual} != package.json ${expected}`);
  process.exit(1);
}
console.log(`Version OK: ${expected}`);
