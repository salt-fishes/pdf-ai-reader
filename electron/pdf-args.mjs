import { readFile, stat } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";

/** Refuse to copy absurdly large PDFs through Electron's IPC. */
export const MAX_PDF_BYTES = 128 * 1024 * 1024;

function normalizeArg(value) {
  const trimmed = String(value).trim();
  return trimmed.replace(/^"(.*)"$/, "$1");
}

/**
 * Pick the first existing PDF from a process argv.
 *
 * Chromium adds switches (`--foo`), the Electron binary itself, the app path,
 * and (in development) Vite URLs. Requiring an existing `.pdf` file removes all
 * of those without maintaining a fragile allow-list.
 */
export function pdfArgFrom(argv) {
  if (!Array.isArray(argv)) return null;
  for (const raw of argv) {
    if (typeof raw !== "string") continue;
    const value = normalizeArg(raw);
    if (!value || value.startsWith("-")) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) continue;
    if (!/\.pdf$/i.test(value)) continue;
    const resolved = path.resolve(value);
    try {
      if (!statSync(resolved).isFile()) continue;
    } catch {
      continue;
    }
    return resolved;
  }
  return null;
}

/** Read a validated PDF into an IPC-safe payload. */
export async function readPdfPayload(file) {
  const resolved = path.resolve(String(file));
  if (!/\.pdf$/i.test(resolved)) throw new Error("只能打开 PDF 文件。");
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new Error("PDF 文件不存在或无法读取。");
  }
  if (!info.isFile()) throw new Error("所选路径不是文件。");
  if (info.size <= 0) throw new Error("PDF 文件为空。");
  if (info.size > MAX_PDF_BYTES) {
    throw new Error(`PDF 超过 ${MAX_PDF_BYTES / 1024 / 1024}MB，暂不支持。`);
  }
  return { name: path.basename(resolved), bytes: await readFile(resolved) };
}
