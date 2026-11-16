import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const REG_EXE = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");

export const PDF_PROG_ID = "PaperReader.pdf";
export const PDF_APPLICATION = "PaperReader";
const COMMAND_KEY = `HKCU\\Software\\Classes\\${PDF_PROG_ID}\\shell\\open\\command`;
const APPLICATIONS_KEY = "HKCU\\Software\\Classes\\Applications\\PaperReader.exe";
const CAPABILITIES_KEY = `HKCU\\Software\\${PDF_APPLICATION}\\Capabilities`;
const REGISTERED_APPLICATIONS = "HKCU\\Software\\RegisteredApplications";
const OPEN_WITH_KEY = "HKCU\\Software\\Classes\\.pdf\\OpenWithProgids";
const USER_CHOICE_KEY =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice";

async function reg(args) {
  const { stdout } = await exec(REG_EXE, args, {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 256 * 1024,
  });
  return stdout;
}

async function add(key, value, type = "REG_SZ", name) {
  const args = ["add", key];
  if (name) args.push("/v", name);
  else args.push("/ve");
  args.push("/t", type, "/f");
  if (value !== null) args.push("/d", value);
  await reg(args);
}

async function query(key, name) {
  try {
    const args = ["query", key];
    if (name) args.push("/v", name);
    else args.push("/ve");
    return await reg(args);
  } catch {
    return null;
  }
}

function lastValue(output) {
  if (!output) return null;
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item && !/^HKEY_/i.test(item))
    .pop();
  const match = line?.match(/REG_(?:SZ|EXPAND_SZ|NONE)\s+(.*)$/i);
  return match ? match[1].trim() : null;
}

function progId(output) {
  if (!output) return null;
  const match = /ProgId\s+REG_SZ\s+(\S+)/i.exec(output);
  return match ? match[1] : null;
}

function normalized(value) {
  return value.trim().replace(/^"|"$/g, "").toLowerCase();
}

/** Windows only; the caller passes the packaged executable path. */
export async function pdfAssociationStatus(exePath) {
  const command = lastValue(await query(COMMAND_KEY));
  const registered = Boolean(command);
  const stale = Boolean(command && !normalized(command).includes(normalized(exePath)));
  const currentDefault = progId(await query(USER_CHOICE_KEY, "ProgId"));
  return {
    supported: true,
    registered,
    stale,
    isDefault:
      currentDefault === PDF_PROG_ID ||
      currentDefault?.toLowerCase() === "applications\\paperreader.exe",
    currentDefault,
    appName: "纸间",
  };
}

export async function registerPdfAssociation(exePath) {
  if (!existsSync(exePath)) throw new Error("找不到当前应用的可执行文件");
  const quoted = `"${path.resolve(exePath)}"`;
  const icon = `${quoted},0`;
  const command = `${quoted} "%1"`;

  await add(`HKCU\\Software\\Classes\\${PDF_PROG_ID}`, "PDF 文档");
  await add(`HKCU\\Software\\Classes\\${PDF_PROG_ID}\\DefaultIcon`, icon);
  await add(COMMAND_KEY, command);
  await add(OPEN_WITH_KEY, null, "REG_NONE", PDF_PROG_ID);

  await add(APPLICATIONS_KEY, "纸间");
  await add(`${APPLICATIONS_KEY}\\FriendlyAppName`, "纸间");
  await add(`${APPLICATIONS_KEY}\\DefaultIcon`, icon);
  await add(`${APPLICATIONS_KEY}\\shell\\open\\command`, command);
  await add(`${APPLICATIONS_KEY}\\SupportedTypes\\.pdf`, null, "REG_NONE");

  await add(CAPABILITIES_KEY, "纸间");
  await add(`${CAPABILITIES_KEY}\\ApplicationName`, "纸间");
  await add(`${CAPABILITIES_KEY}\\ApplicationDescription`, "本地优先的 PDF 阅读器与 AI 阅读助手");
  await add(`${CAPABILITIES_KEY}\\ApplicationIcon`, icon);
  await add(`${CAPABILITIES_KEY}\\FileAssociations\\.pdf`, PDF_PROG_ID);
  await add(
    REGISTERED_APPLICATIONS,
    `Software\\${PDF_APPLICATION}\\Capabilities`,
    "REG_SZ",
    PDF_APPLICATION,
  );

  return pdfAssociationStatus(exePath);
}

async function removeKey(key) {
  try {
    await reg(["delete", key, "/f"]);
  } catch {
    // Already absent is fine.
  }
}

async function removeValue(key, name) {
  try {
    await reg(["delete", key, "/v", name, "/f"]);
  } catch {
    // Already absent is fine.
  }
}

export async function removePdfAssociation(exePath) {
  const status = await pdfAssociationStatus(exePath);
  if (status.isDefault) {
    throw new Error("纸间当前是默认 PDF 应用，请先在 Windows 设置中改为其他应用，再移除关联。");
  }
  await removeKey(`HKCU\\Software\\Classes\\${PDF_PROG_ID}`);
  await removeKey(APPLICATIONS_KEY);
  await removeKey(`HKCU\\Software\\${PDF_APPLICATION}`);
  await removeValue(REGISTERED_APPLICATIONS, PDF_APPLICATION);
  await removeValue(OPEN_WITH_KEY, PDF_PROG_ID);
  return pdfAssociationStatus(exePath);
}

export function unsupportedPdfAssociation() {
  return {
    supported: false,
    registered: false,
    stale: false,
    isDefault: false,
    currentDefault: null,
    appName: "纸间",
  };
}
