import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import AdmZip from "adm-zip";

/**
 * OCR runtime pack.
 *
 * The portable build no longer carries ONNX Runtime, OpenCV and the canvas
 * binary (~70MB unpacked). They are downloaded once, verified against the
 * release checksum file, extracted under `OCR_RUNTIME_DIR` and loaded from
 * there by the OCR worker. Source checkouts and `npm start` keep using the
 * local `node_modules`, so development and the browser build need no pack.
 *
 * Some Chinese security suites (360, etc.) block unsigned processes from
 * writing DLLs into user profile folders. When the preferred root is blocked
 * we retry in the per-user temp folder; it is still persistent enough for a
 * cache and is re-created if Windows cleans it.
 */
const RELEASE_ROOT = "https://github.com/salt-fishes/pdf-ai-reader/releases/download";
const PACK_VERSION = (process.env.OCR_PACK_VERSION ?? "").trim().replace(/^v/, "");

/**
 * Format of the unpacked runtime tree, independent of the app version.
 *
 * The runtime only has to be replaced when its directory layout or native
 * dependency set changes. Tying this to the app version made every upgrade
 * invalidate a perfectly good ~70MB runtime and download it again.
 */
export const OCR_RUNTIME_FORMAT = 1;

export const OCR_RUNTIME_APPROX_BYTES = 27_000_000;
const MAX_PACK_BYTES = 200 * 1024 * 1024;
const RUNTIME_MARKER = "runtime.json";

const preferredRoot = process.env.OCR_RUNTIME_DIR?.trim()
  ? path.resolve(process.env.OCR_RUNTIME_DIR)
  : null;
const FALLBACK_PARENT = path.join(tmpdir(), "paper-reader-ocr");
const fallbackRoot = path.join(FALLBACK_PARENT, `runtime-v${OCR_RUNTIME_FORMAT}`);

function assetName(): string {
  return PACK_VERSION ? `paper-reader-ocr-v${PACK_VERSION}-win-x64.zip` : "";
}

function releaseAssetBase(): string {
  return PACK_VERSION ? `${RELEASE_ROOT}/v${PACK_VERSION}` : "";
}

export function ocrPackUrl(): string {
  return (
    process.env.OCR_PACK_URL?.trim() || (PACK_VERSION ? `${releaseAssetBase()}/${assetName()}` : "")
  );
}

export function ocrPackChecksumUrl(): string {
  return (
    process.env.OCR_PACK_SHA_URL?.trim() ||
    (PACK_VERSION ? `${releaseAssetBase()}/SHA256SUMS.txt` : "")
  );
}

export function ocrPackFileName(): string {
  try {
    return decodeURIComponent(new URL(ocrPackUrl()).pathname.split("/").pop() ?? "");
  } catch {
    return assetName();
  }
}

function localRuntimeAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("ppu-paddle-ocr");
    return true;
  } catch {
    return false;
  }
}

/** Parse `hash  file` lines from a sha256sum-style file. */
export function parseChecksum(text: string, fileName: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (!match) continue;
    const name = match[2].trim().split(/[\\/]/).pop() ?? "";
    if (name === fileName) return match[1].toLowerCase();
  }
  return null;
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * Accept the current marker format and the legacy 0.7.x marker that only had
 * a `version` field. A future incompatible runtime bumps OCR_RUNTIME_FORMAT;
 * anything newer than this build is rejected rather than loaded blindly.
 */
export function runtimeMarkerAcceptable(marker: unknown): boolean {
  if (!marker || typeof marker !== "object") return false;
  const record = marker as { format?: unknown; version?: unknown };
  if (typeof record.format === "number") return record.format === OCR_RUNTIME_FORMAT;
  return typeof record.version === "string" && record.version.trim().length > 0;
}

const REQUIRED_RUNTIME_PACKAGES = [
  ["ppu-paddle-ocr"],
  ["onnxruntime-node"],
  ["@napi-rs", "canvas"],
  ["@techstark", "opencv-js"],
] as const;

/** Lightweight integrity check before loading native modules from a pack. */
export function runtimeRequiredFilesPresent(root: string): boolean {
  return REQUIRED_RUNTIME_PACKAGES.every((parts) =>
    existsSync(path.join(root, "node_modules", ...parts, "package.json")),
  );
}

async function rootIsReady(root: string): Promise<boolean> {
  try {
    const marker = JSON.parse(await readFile(path.join(root, RUNTIME_MARKER), "utf8")) as unknown;
    if (!runtimeMarkerAcceptable(marker)) return false;
    return runtimeRequiredFilesPresent(root);
  } catch {
    return false;
  }
}

/**
 * Older builds put the temp fallback under the app version. Keep accepting
 * those directories so users who were already forced out of the preferred
 * folder do not re-download after upgrading.
 */
function legacyFallbackRoots(): string[] {
  let entries;
  try {
    entries = readdirSync(FALLBACK_PARENT, { withFileTypes: true });
  } catch {
    return [];
  }
  const current = path.basename(fallbackRoot);
  return entries
    .filter(
      (entry) => entry.isDirectory() && entry.name !== current && /^\d+\.\d+\.\d+/.test(entry.name),
    )
    .map((entry) => {
      const full = path.join(FALLBACK_PARENT, entry.name);
      let mtime = 0;
      try {
        mtime = statSync(full).mtimeMs;
      } catch {
        // Race with Windows temp cleanup; keep it last.
      }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 4)
    .map((entry) => entry.full);
}

function runtimeCandidates(): string[] {
  if (!preferredRoot) return [];
  const roots = [preferredRoot, fallbackRoot, ...legacyFallbackRoots()];
  return [...new Set(roots)];
}

/** The installed runtime root, or null when a source checkout uses node_modules. */
export async function resolveOcrRuntimeRoot(): Promise<string | null> {
  for (const root of runtimeCandidates()) {
    if (await rootIsReady(root)) return root;
  }
  return null;
}

export async function isOcrRuntimeInstalled(): Promise<boolean> {
  if (!preferredRoot) return localRuntimeAvailable();
  return (await resolveOcrRuntimeRoot()) !== null;
}

export type OcrRuntimeStatus = {
  installed: boolean;
  downloading: boolean;
  downloaded: number;
  total: number;
  progress: number;
  approxBytes: number;
  downloadable: boolean;
  error: string | null;
};

const state = {
  active: false,
  downloaded: 0,
  total: 0,
  error: null as string | null,
};

export async function ocrRuntimeStatus(): Promise<OcrRuntimeStatus> {
  const installed = await isOcrRuntimeInstalled();
  return {
    installed,
    downloading: state.active,
    downloaded: state.active ? state.downloaded : 0,
    total: state.active ? state.total : 0,
    progress: state.active
      ? state.total
        ? Math.min(1, state.downloaded / state.total)
        : 0
      : installed
        ? 1
        : 0,
    approxBytes: OCR_RUNTIME_APPROX_BYTES,
    downloadable: Boolean(ocrPackUrl() && ocrPackChecksumUrl()),
    error: state.error,
  };
}

async function fetchChecksum(): Promise<string> {
  const url = ocrPackChecksumUrl();
  if (!url) throw new Error("此构建没有配置 OCR 组件校验和地址");
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("无法获取 OCR 组件校验和，请检查网络或代理");
  }
  if (!response.ok) throw new Error(`无法获取 OCR 组件校验和（${response.status}）`);
  const expected = parseChecksum(await response.text(), ocrPackFileName());
  if (!expected) throw new Error("校验和文件中没有 OCR 组件，拒绝安装");
  return expected;
}

async function downloadPack(target: string): Promise<void> {
  const url = ocrPackUrl();
  if (!url) throw new Error("此构建没有配置 OCR 组件下载地址");
  state.total = OCR_RUNTIME_APPROX_BYTES;
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
  } catch {
    throw new Error("无法连接 OCR 组件下载源，请检查网络或代理");
  }
  if (!response.ok || !response.body) {
    throw new Error(`OCR 组件下载失败（${response.status}）`);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_PACK_BYTES) throw new Error("OCR 组件超过 200MB 上限");
  if (length > 0) state.total = length;

  let received = 0;
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on("data", (chunk: Buffer) => {
    received += chunk.length;
    state.downloaded = received;
  });
  await pipeline(body, createWriteStream(target));
  state.downloaded = received;
  if (received < 1_000_000) throw new Error("OCR 组件下载不完整");
}

async function writeWithRetry(target: string, data: Buffer): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(target, data);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 3 || (code !== "EBUSY" && code !== "EPERM")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

/**
 * Extract through `writeFile` rather than adm-zip's extractAllToAsync: the
 * latter swallows the underlying Windows error, and Electron's fs.write path
 * intermittently fails on the 31MB ONNX DLL while a plain writeFile succeeds.
 */
async function extractPack(archive: string, staging: string): Promise<void> {
  const zip = new AdmZip(archive);
  const root = path.resolve(staging);
  for (const entry of zip.getEntries()) {
    const parts = entry.entryName
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== ".");
    if (!parts.length || parts.some((part) => part === "..")) {
      throw new Error("OCR 组件包包含非法路径");
    }
    const target = path.resolve(root, ...parts);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error("OCR 组件包包含非法路径");
    }
    if (entry.isDirectory) {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeWithRetry(target, entry.getData());
  }
}

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY" || code === "EROFS";
}

async function installInto(archive: string, root: string): Promise<void> {
  const staging = `${root}.tmp`;
  await mkdir(path.dirname(root), { recursive: true });
  await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(staging, { recursive: true });
  await extractPack(archive, staging);
  if (!existsSync(path.join(staging, "node_modules", "ppu-paddle-ocr", "package.json"))) {
    throw new Error("OCR 组件包结构不正确");
  }
  await writeFile(
    path.join(staging, RUNTIME_MARKER),
    `${JSON.stringify(
      {
        format: OCR_RUNTIME_FORMAT,
        packVersion: PACK_VERSION,
        installedAt: new Date().toISOString(),
        // Diagnostics only; they never invalidate an otherwise compatible pack.
        electron: process.versions.electron ?? null,
        node: process.versions.node,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
  await rename(staging, root);
}

async function runInstall(force: boolean): Promise<void> {
  if (!force && (await isOcrRuntimeInstalled())) return;
  if (!preferredRoot) {
    throw new Error("当前运行方式没有配置 OCR 组件目录");
  }
  if (!ocrPackUrl() || !ocrPackChecksumUrl()) {
    throw new Error("此构建没有配置 OCR 组件下载源");
  }

  const archive = path.join(tmpdir(), `paper-reader-ocr-${process.pid}.zip.part`);
  state.active = true;
  state.downloaded = 0;
  state.error = null;

  try {
    await rm(archive, { force: true }).catch(() => undefined);
    await downloadPack(archive);
    const expected = await fetchChecksum();
    const actual = await sha256File(archive);
    if (actual !== expected) {
      throw new Error("OCR 组件校验失败，文件可能不完整，请重试");
    }

    let lastError: unknown = null;
    for (const root of runtimeCandidates()) {
      if (!force && (await rootIsReady(root))) return;
      try {
        await installInto(archive, root);
        state.downloaded = state.total;
        return;
      } catch (error) {
        lastError = error;
        // Only fall back when the folder itself is blocked; checksum and
        // archive-shape errors must be reported instead of retried elsewhere.
        if (!isPermissionError(error)) break;
      }
    }
    throw lastError ?? new Error("OCR 组件安装失败");
  } catch (error) {
    state.error = error instanceof Error ? error.message : "OCR 组件安装失败";
    throw error;
  } finally {
    state.active = false;
    await rm(archive, { force: true }).catch(() => undefined);
    for (const root of runtimeCandidates()) {
      await rm(`${root}.tmp`, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

let installing: Promise<void> | null = null;

/**
 * Download, verify and unpack the OCR runtime once. Concurrent calls share one
 * job. `force` is reserved for the explicit “repair components” action.
 */
export function installOcrRuntime(options: { force?: boolean } = {}): Promise<void> {
  if (installing) return installing;
  installing = runInstall(Boolean(options.force)).finally(() => {
    installing = null;
  });
  return installing;
}
