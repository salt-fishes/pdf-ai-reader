import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const root = process.cwd();
const release = process.env.PDF_AI_RELEASE_DIR
  ? join(process.env.PDF_AI_RELEASE_DIR)
  : join(root, "release");
const out = join(release, "win-unpacked");
const electronDist = join(root, "node_modules", "electron", "dist");

if (!existsSync(electronDist)) {
  throw new Error("Electron 二进制未安装；先运行 npm install / node node_modules/electron/install.js");
}
for (const required of ["dist", "server/dist/index.mjs"]) {
  if (!existsSync(join(root, required))) {
    throw new Error(`缺少 ${required}；请先运行 npm run build && npm run build:server`);
  }
}

function psCopy(source, destination) {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Remove-Item -LiteralPath '${destination.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath '${source.replace(/'/g, "''")}' -Destination '${destination.replace(/'/g, "''")}' -Recurse -Force`,
  ]);
}

psCopy(electronDist, out);

// Keep only the UI locales this app ships; the other 53 .pak files are ~45MB.
const localesDir = join(out, "locales");
execFileSync("powershell", [
  "-NoProfile",
  "-Command",
  `Get-ChildItem -LiteralPath '${localesDir.replace(/'/g, "''")}' -File | Where-Object { $_.Name -notin @('zh-CN.pak','en-US.pak') } | Remove-Item -Force -ErrorAction SilentlyContinue`,
]);

const appDir = join(out, "resources", "app");
mkdirSync(appDir, { recursive: true });
for (const item of [
  "dist",
  "server/dist",
  "server/models",
  "electron",
  "package.json",
  "LICENSE",
  "README.md",
]) {
  const source = join(root, item);
  if (!existsSync(source)) continue;
  psCopy(source, join(appDir, item));
}

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
  const target = join(appDir, "node_modules", ...name.split("/"));
  mkdirSync(join(target, ".."), { recursive: true });
  psCopy(source, target);
}

// Keep only the Windows x64 ONNX Runtime; the package ships all platforms.
for (const platform of ["darwin", "linux"]) {
  const target = join(appDir, "node_modules", "onnxruntime-node", "bin", "napi-v6", platform);
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Remove-Item -LiteralPath '${target.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`,
  ]);
}
const arm64Dir = join(
  appDir,
  "node_modules",
  "onnxruntime-node",
  "bin",
  "napi-v6",
  "win32",
  "arm64",
);
execFileSync("powershell", [
  "-NoProfile",
  "-Command",
  `if (Test-Path -LiteralPath '${arm64Dir.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${arm64Dir.replace(/'/g, "''")}' -Recurse -Force }`,
]);

// OCR uses the CPU execution provider. DirectML/dxcompiler are only needed
// for GPU inference and add ~35MB to the portable build.
for (const file of ["DirectML.dll", "dxcompiler.dll"]) {
  const target = join(
    appDir,
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v6",
    "win32",
    "x64",
    file,
  );
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `if (Test-Path -LiteralPath '${target.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${target.replace(/'/g, "''")}' -Force }`,
  ]);
}

const exe = join(out, "PaperReader.exe");
if (existsSync(join(out, "electron.exe"))) {
  psCopy(join(out, "electron.exe"), exe);
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Remove-Item -LiteralPath '${join(out, "electron.exe").replace(/'/g, "''")}' -Force`,
  ]);
}

const rceditCandidates = [
  join(homedir(), "AppData", "Local", "electron-builder", "Cache", "winCodeSign", "winCodeSign-2.6.0", "rcedit-x64.exe"),
];
const rcedit = rceditCandidates.find((path) => existsSync(path));
if (rcedit && existsSync(join(root, "build", "icon.ico"))) {
  try {
    execFileSync(rcedit, [
      exe,
      "--set-icon",
      join(root, "build", "icon.ico"),
      "--set-file-version",
      "0.1.0",
      "--set-product-version",
      "0.1.0",
      "--set-version-string",
      "ProductName",
      "纸间",
      "--set-version-string",
      "FileDescription",
      "纸间 · PDF × AI 阅读器",
    ]);
  } catch {
    console.warn("rcedit 失败，保留默认 Electron 图标");
  }
}

writeFileSync(
  join(out, "README.txt"),
  [
    "纸间 · PDF × AI 阅读器",
    "",
    "1. 双击 PaperReader.exe 启动。",
    "2. 第一次使用：打开右上角设置 → 模型服务，填入 Base URL、模型名与 API Key。",
    "3. 桌面版把配置、OCR 模型和阅读数据放在 Electron userData 目录。",
    "4. 主 PDF 不上传；只发送你明确选择的页码、文字、截图与附件。",
    "",
    "如果没有配置密钥，应用仍可打开和阅读 PDF。",
  ].join("\r\n"),
  "utf8",
);

console.log(`portable desktop app ready: ${out}`);
console.log(`zip it with: Compress-Archive -Path '${join(out, "*")}' -DestinationPath '${join(release, "paper-reader-0.1.0-win-x64.zip")}'`);
