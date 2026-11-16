import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  "coverage",
  "test-results",
  "playwright-report",
  "models",
  "data",
]);
const skipPrefixes = [join("public", "pdfjs") + sep, join("server", "dist") + sep];
const external = /^(?:[a-z]+:)?\/\//i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (skipPrefixes.some((prefix) => (rel + sep).startsWith(prefix))) continue;
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

function stripFences(text) {
  return text.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, "");
}

function cleanTarget(raw) {
  let target = raw.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  target = target.split(/\s+(?=["'(])/)[0];
  if (external.test(target) || /^(?:mailto|tel|data):/i.test(target)) return null;
  target = target.split("#")[0].split("?")[0];
  if (!target) return null;
  try {
    target = decodeURI(target);
  } catch {
    // Keep the raw target when it contains a malformed escape.
  }
  return target;
}

const broken = [];
for (const file of walk(root)) {
  const text = stripFences(readFileSync(file, "utf8"));
  const links = [
    ...text.matchAll(/!?\[[^\]]*\]\(([^)\n]+)\)/g),
    ...text.matchAll(/^[ \t]*\[[^\]]+\]:[ \t]*(\S+)/gm),
  ];
  for (const match of links) {
    const target = cleanTarget(match[1]);
    if (!target) continue;
    const base = target.startsWith("/") ? root : dirname(file);
    const resolved = normalize(resolve(base, target.startsWith("/") ? target.slice(1) : target));
    if (isAbsolute(resolved) && !resolved.startsWith(root)) continue;
    if (!existsSync(resolved)) {
      broken.push(`${relative(root, file)} -> ${match[1]} (resolved: ${relative(root, resolved)})`);
    }
  }
}

if (broken.length) {
  console.error(`Broken relative links: ${broken.length}`);
  for (const line of broken) console.error(`  ${line}`);
  process.exit(1);
}
console.log("Documentation links OK");
