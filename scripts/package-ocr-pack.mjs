import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Assemble the optional OCR runtime pack.
 *
 * The portable app ships without ONNX Runtime / OpenCV / canvas, so this pack
 * is uploaded next to it and downloaded once from Settings. Keep the contents
 * limited to the Windows x64 CPU runtime: DirectML, foreign platforms and ICU
 * tables only inflate the download.
 */
const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const release = process.env.PDF_AI_RELEASE_DIR
  ? join(process.env.PDF_AI_RELEASE_DIR)
  : join(root, "release");
const out = join(release, "ocr-pack");

function psRemove(target) {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `if (Test-Path -LiteralPath '${target.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${target.replace(/'/g, "''")}' -Recurse -Force }`,
  ]);
}

function psCopy(source, destination) {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Remove-Item -LiteralPath '${destination.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath '${source.replace(/'/g, "''")}' -Destination '${destination.replace(/'/g, "''")}' -Recurse -Force`,
  ]);
}

psRemove(out);
mkdirSync(out, { recursive: true });

const modules = [
  "onnxruntime-node",
  "onnxruntime-common",
  "ppu-paddle-ocr",
  "ppu-ocv",
  "@napi-rs/canvas",
  "@napi-rs/canvas-win32-x64-msvc",
  "@techstark/opencv-js",
];
for (const name of modules) {
  const source = join(root, "node_modules", ...name.split("/"));
  if (!existsSync(source)) throw new Error(`缺少运行时依赖 ${name}`);
  const target = join(out, "node_modules", ...name.split("/"));
  mkdirSync(join(target, ".."), { recursive: true });
  psCopy(source, target);
}

// Keep only the Windows x64 ONNX Runtime; the package ships all platforms.
for (const platform of ["darwin", "linux"]) {
  psRemove(join(out, "node_modules", "onnxruntime-node", "bin", "napi-v6", platform));
}
psRemove(join(out, "node_modules", "onnxruntime-node", "bin", "napi-v6", "win32", "arm64"));

// OCR uses the CPU execution provider; DirectML/dxcompiler add ~35MB.
for (const file of ["DirectML.dll", "dxcompiler.dll"]) {
  psRemove(join(out, "node_modules", "onnxruntime-node", "bin", "napi-v6", "win32", "x64", file));
}

// TypeScript sources and declarations are not loaded at runtime.
psRemove(join(out, "node_modules", "@techstark", "opencv-js", "src"));
psRemove(join(out, "node_modules", "@techstark", "opencv-js", "dist", "src"));
// OCR only rasterises page images; the canvas text/ICU tables are unused.
psRemove(join(out, "node_modules", "@napi-rs", "canvas-win32-x64-msvc", "icudtl.dat"));

// Importing the entry loads onnxruntime-node, canvas and OpenCV. Doing it from
// the assembled tree catches a missing module before the release is uploaded.
const entry = pathToFileURL(join(out, "node_modules", "ppu-paddle-ocr", "index.js")).href;
const loaded = await import(entry);
if (typeof loaded.PaddleOcrService !== "function") {
  throw new Error("OCR 运行时包自检失败：找不到 PaddleOcrService");
}

function directoryBytes(dir) {
  return execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `(Get-ChildItem -LiteralPath '${dir.replace(/'/g, "''")}' -Recurse -File | Measure-Object Length -Sum).Sum`,
  ])
    .toString()
    .trim();
}

console.log(`OCR runtime pack ready: ${out}`);
console.log(`size: ${(Number(directoryBytes(out)) / 1024 / 1024).toFixed(1)}MB (unpacked)`);
console.log(
  `zip it with: Compress-Archive -Path '${join(out, "*")}' -DestinationPath '${join(release, `paper-reader-ocr-v${version}-win-x64.zip`)}'`,
);
