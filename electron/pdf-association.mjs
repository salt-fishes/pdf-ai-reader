import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const REG_EXE = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");

export const PDF_PROG_ID = "PaperReader.pdf";
/** Display name; must match the value name under RegisteredApplications. */
export const PDF_APPLICATION_NAME = "纸间";
const CAPABILITIES_ROOT = "PaperReader";

const HIVES = {
  user: "HKCU",
  machine: "HKLM",
};

function keys(scope) {
  const hive = HIVES[scope];
  if (!hive) throw new Error("未知的注册范围");
  return {
    hive,
    progId: `${hive}\\Software\\Classes\\${PDF_PROG_ID}`,
    command: `${hive}\\Software\\Classes\\${PDF_PROG_ID}\\shell\\open\\command`,
    applications: `${hive}\\Software\\Classes\\Applications\\PaperReader.exe`,
    capabilities: `${hive}\\Software\\${CAPABILITIES_ROOT}\\Capabilities`,
    registered: `${hive}\\Software\\RegisteredApplications`,
    openWith: `${hive}\\Software\\Classes\\.pdf\\OpenWithProgids`,
    userChoice:
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice",
  };
}

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

/** Registry entries needed for one scope, used by both direct and elevated installs. */
export function associationEntries(exePath, scope = "user") {
  const k = keys(scope);
  const quoted = `"${path.resolve(exePath)}"`;
  const icon = `${quoted},0`;
  const command = `${quoted} "%1"`;
  return [
    { key: k.progId, value: "PDF 文档" },
    { key: `${k.progId}\\DefaultIcon`, value: icon },
    { key: `${k.progId}\\Application`, value: PDF_APPLICATION_NAME },
    { key: `${k.progId}\\Application\\ApplicationName`, value: PDF_APPLICATION_NAME },
    { key: `${k.progId}\\Application\\ApplicationIcon`, value: icon },
    { key: k.command, value: command },
    { key: k.openWith, name: PDF_PROG_ID, type: "REG_NONE", value: null },
    { key: k.applications, value: PDF_APPLICATION_NAME },
    { key: `${k.applications}\\FriendlyAppName`, value: PDF_APPLICATION_NAME },
    { key: `${k.applications}\\DefaultIcon`, value: icon },
    { key: `${k.applications}\\shell\\open\\command`, value: command },
    { key: `${k.applications}\\SupportedTypes\\.pdf`, type: "REG_NONE", value: null },
    { key: k.capabilities, value: PDF_APPLICATION_NAME },
    { key: `${k.capabilities}\\ApplicationName`, value: PDF_APPLICATION_NAME },
    {
      key: `${k.capabilities}\\ApplicationDescription`,
      value: "本地优先的 PDF 阅读器与 AI 阅读助手",
    },
    { key: `${k.capabilities}\\ApplicationIcon`, value: icon },
    { key: `${k.capabilities}\\FileAssociations\\.pdf`, value: PDF_PROG_ID },
    {
      key: k.registered,
      name: PDF_APPLICATION_NAME,
      value: `Software\\${CAPABILITIES_ROOT}\\Capabilities`,
    },
  ];
}

export async function pdfAssociationStatus(exePath) {
  const machine = keys("machine");
  const user = keys("user");
  const machineCommand = lastValue(await query(machine.command));
  const userCommand = lastValue(await query(user.command));
  const command = machineCommand ?? userCommand;
  const scope = machineCommand ? "machine" : userCommand ? "user" : null;
  const stale = Boolean(command && !normalized(command).includes(normalized(exePath)));
  const currentDefault = progId(await query(user.userChoice, "ProgId"));
  return {
    supported: true,
    registered: Boolean(command),
    scope,
    stale,
    isDefault:
      currentDefault === PDF_PROG_ID ||
      currentDefault?.toLowerCase() === "applications\\paperreader.exe",
    currentDefault,
    appName: PDF_APPLICATION_NAME,
  };
}

export async function registerPdfAssociation(exePath, scope = "user") {
  if (!existsSync(exePath)) throw new Error("找不到当前应用的可执行文件");
  for (const entry of associationEntries(exePath, scope)) {
    await add(entry.key, entry.value, entry.type, entry.name);
  }
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

export async function removePdfAssociation(exePath, scope = "user") {
  const status = await pdfAssociationStatus(exePath);
  if (status.isDefault) {
    throw new Error("纸间当前是默认 PDF 应用，请先在 Windows 设置中改为其他应用，再移除关联。");
  }
  const k = keys(scope);
  await removeKey(k.progId);
  await removeKey(k.applications);
  await removeKey(`${k.hive}\\Software\\${CAPABILITIES_ROOT}`);
  await removeValue(k.registered, PDF_APPLICATION_NAME);
  await removeValue(k.registered, "PaperReader");
  await removeValue(k.openWith, PDF_PROG_ID);
  return pdfAssociationStatus(exePath);
}

export function associationRemovals(scope = "user") {
  const k = keys(scope);
  return {
    keys: [k.progId, k.applications, `${k.hive}\\Software\\${CAPABILITIES_ROOT}`],
    values: [
      [k.registered, PDF_APPLICATION_NAME],
      [k.registered, "PaperReader"],
      [k.openWith, PDF_PROG_ID],
    ],
  };
}

export function unsupportedPdfAssociation() {
  return {
    supported: false,
    registered: false,
    scope: null,
    stale: false,
    isDefault: false,
    currentDefault: null,
    appName: PDF_APPLICATION_NAME,
  };
}
