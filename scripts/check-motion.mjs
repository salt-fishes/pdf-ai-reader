import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = "src";
const motionFile = join(root, "styles", "motion.css");
const tokenFiles = new Set([join(root, "styles", "tokens.css"), motionFile]);

const allowed = new Set(
  [...readFileSync(motionFile, "utf8").matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]),
);

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".css") && !tokenFiles.has(full)) files.push(full);
  }
}
walk(root);

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const where = `${relative(".", file)}:${index + 1}`;
    if (/\b\d+(?:\.\d+)?m?s\b/.test(line)) {
      problems.push(`${where} raw duration: ${line.trim()}`);
    }
    if (/transition:\s*all\b/.test(line)) {
      problems.push(`${where} transition: all is not allowed`);
    }
    if (/@keyframes\s+/.test(line)) {
      problems.push(`${where} keyframes must live in styles/motion.css`);
    }
    const animation = line.match(/animation(?:-name)?:\s*([\w-]+)/);
    if (animation && !["none", "inherit", "initial", "unset"].includes(animation[1])) {
      if (!allowed.has(animation[1])) {
        problems.push(`${where} unregistered keyframes: ${animation[1]}`);
      }
    }
  });
}

if (problems.length) {
  console.error(`Motion check failed: ${problems.length}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Motion check OK (${files.length} files, ${allowed.size} keyframes)`);
