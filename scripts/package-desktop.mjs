import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const release = process.env.PDF_AI_RELEASE_DIR
  ? join(process.env.PDF_AI_RELEASE_DIR)
  : join(root, "release");
const out = join(release, "win-unpacked");
const electronDist = join(root, "node_modules", "electron", "dist");

function psRemove(target) {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `if (Test-Path -LiteralPath '${target.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${target.replace(/'/g, "''")}' -Recurse -Force }`,
  ]);
}

if (!existsSync(electronDist)) {
  throw new Error(
    "Electron 二进制未安装；先运行 npm install / node node_modules/electron/install.js",
  );
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
for (const item of ["dist", "server/dist", "electron", "package.json", "LICENSE", "README.md"]) {
  const source = join(root, item);
  if (!existsSync(source)) continue;
  psCopy(source, join(appDir, item));
}

// OCR (ONNX Runtime, OpenCV, canvas, models) is an on-demand download. Keeping
// it out of the portable app saves ~77MB and lets the core reader stay small.
psRemove(join(appDir, "server", "models"));
psRemove(join(appDir, "node_modules"));

// Electron's bundled default app is unused once resources/app is present.
psRemove(join(out, "resources", "default_app.asar"));

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
  join(root, "node_modules", "rcedit", "bin", "rcedit-x64.exe"),
  join(
    homedir(),
    "AppData",
    "Local",
    "electron-builder",
    "Cache",
    "winCodeSign",
    "winCodeSign-2.6.0",
    "rcedit-x64.exe",
  ),
];
const rcedit = rceditCandidates.find((path) => existsSync(path));
if (rcedit && existsSync(join(root, "build", "icon.ico"))) {
  try {
    execFileSync(rcedit, [
      exe,
      "--set-icon",
      join(root, "build", "icon.ico"),
      "--set-file-version",
      version,
      "--set-product-version",
      version,
      "--set-version-string",
      "ProductName",
      "纸间",
      "--set-version-string",
      "FileDescription",
      "纸间 · PDF × AI 阅读器",
      "--set-version-string",
      "CompanyName",
      "Paper Reader contributors",
      "--set-version-string",
      "LegalCopyright",
      "Copyright © 2026 Paper Reader contributors",
      "--set-version-string",
      "OriginalFilename",
      "PaperReader.exe",
      "--set-version-string",
      "InternalName",
      "PaperReader",
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
    "3. 配置、阅读记录、OCR 组件与模型都保存在这台电脑上，不上传。",
    "4. 扫描件 OCR 是可选组件：首次开启时下载约 26MB 组件 + 6MB tiny 模型，之后可离线使用。",
    "5. 主 PDF 不上传；只发送你明确选择的页码、文字、截图与附件。",
    "",
    "如果没有配置密钥，应用仍可打开和阅读 PDF。",
  ].join("\r\n"),
  "utf8",
);

console.log(`portable desktop app ready: ${out}`);
console.log(
  `zip it with: Compress-Archive -Path '${join(out, "*")}' -DestinationPath '${join(release, `paper-reader-${version}-win-x64.zip`)}'`,
);
