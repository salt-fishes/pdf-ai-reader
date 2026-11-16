import { existsSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = String(process.argv[2] ?? pkg.version).replace(/^v/, "");
const changelog = readFileSync("CHANGELOG.md", "utf8");
const heading = new RegExp(`^##\\s*\\[?${version.replace(/\./g, "\\.")}\\]?.*$`, "m");
const start = changelog.search(heading);
if (start < 0) {
  console.error(`No CHANGELOG section for ${version}`);
  process.exit(1);
}
const rest = changelog.slice(start);
const next = rest.slice(1).search(/^##\s/m);
let section = (next < 0 ? rest : rest.slice(0, next + 1)).trim();
if (existsSync("release/SHA256SUMS.txt")) {
  const checksums = readFileSync("release/SHA256SUMS.txt", "utf8").trim();
  section += `\n\n## 校验和\n\n\`\`\`\n${checksums}\n\`\`\``;
}
writeFileSync("release-notes.md", `${section}\n`, "utf8");
console.log(`release-notes.md written for ${version}`);
