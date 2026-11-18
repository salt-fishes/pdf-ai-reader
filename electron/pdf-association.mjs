import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const REG_EXE = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
const POWERSHELL = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

export const PDF_PROG_ID = "Wenshu.pdf";
/** Display name; must match the value name under RegisteredApplications. */
export const PDF_APPLICATION_NAME = "文疏";
export const PDF_EXE_NAME = "Wenshu.exe";
/** Previous display name, kept only so upgrades remove the old registration. */
const LEGACY_APPLICATION_NAME = "\u7eb8\u95f4";
/** Pre-0.10.2 internal names; kept only for clean upgrades. */
const LEGACY_PROG_ID = "PaperReader.pdf";
const LEGACY_EXE_NAME = "PaperReader.exe";
const CAPABILITIES_ROOT = "Wenshu";
const LEGACY_CAPABILITIES_ROOT = "PaperReader";

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
    applications: `${hive}\\Software\\Classes\\Applications\\${PDF_EXE_NAME}`,
    capabilitiesRoot: `${hive}\\Software\\${CAPABILITIES_ROOT}`,
    capabilities: `${hive}\\Software\\${CAPABILITIES_ROOT}\\Capabilities`,
    registered: `${hive}\\Software\\RegisteredApplications`,
    openWith: `${hive}\\Software\\Classes\\.pdf\\OpenWithProgids`,
    userChoice:
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice",
  };
}

function legacyKeys(scope) {
  const hive = HIVES[scope];
  if (!hive) throw new Error("未知的注册范围");
  return {
    progId: `${hive}\\Software\\Classes\\${LEGACY_PROG_ID}`,
    applications: `${hive}\\Software\\Classes\\Applications\\${LEGACY_EXE_NAME}`,
    capabilitiesRoot: `${hive}\\Software\\${LEGACY_CAPABILITIES_ROOT}`,
    capabilities: `${hive}\\Software\\${LEGACY_CAPABILITIES_ROOT}\\Capabilities`,
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

/** The dedicated Explorer icon shipped next to the executable. */
export function pdfFileIconPath(exePath) {
  return path.join(path.dirname(path.resolve(exePath)), "pdf-file.ico");
}

/**
 * Registry entries needed for one scope, used by both direct and elevated
 * installs. `ApplicationName`, `ApplicationDescription` and `ApplicationIcon`
 * are values of `Capabilities`, not subkeys: Windows silently drops the whole
 * entry from Default Apps when they are missing.
 *
 * `ApplicationIcon` describes the app and keeps the book mark; the `.pdf`
 * ProgID's `DefaultIcon` uses the white file icon when it is shipped next to
 * the exe, so Explorer distinguishes documents from the app itself.
 */
export function associationEntries(
  exePath,
  scope = "user",
  fileIconPath = pdfFileIconPath(exePath),
) {
  const k = keys(scope);
  const exe = path.resolve(exePath);
  const appIcon = `${exe},0`;
  const resolvedFileIcon = path.resolve(fileIconPath);
  const pdfIcon = existsSync(resolvedFileIcon) ? `${resolvedFileIcon},0` : appIcon;
  const command = `"${exe}" "%1"`;
  return [
    { key: k.progId, value: "PDF 文档" },
    { key: `${k.progId}\\DefaultIcon`, value: pdfIcon },
    { key: k.command, value: command },
    { key: k.openWith, name: PDF_PROG_ID, type: "REG_NONE", value: null },
    { key: k.applications, value: PDF_APPLICATION_NAME },
    { key: `${k.applications}\\FriendlyAppName`, value: PDF_APPLICATION_NAME },
    { key: `${k.applications}\\DefaultIcon`, value: appIcon },
    { key: `${k.applications}\\shell\\open\\command`, value: command },
    { key: `${k.applications}\\SupportedTypes`, name: ".pdf", type: "REG_NONE", value: null },
    { key: k.capabilities, name: "ApplicationName", value: PDF_APPLICATION_NAME },
    {
      key: k.capabilities,
      name: "ApplicationDescription",
      value: "文疏 · 本地优先的 PDF 阅读器与 AI 阅读助手",
    },
    { key: k.capabilities, name: "ApplicationIcon", value: appIcon },
    { key: `${k.capabilities}\\FileAssociations`, name: ".pdf", value: PDF_PROG_ID },
    {
      key: k.registered,
      name: PDF_APPLICATION_NAME,
      value: `Software\\${CAPABILITIES_ROOT}\\Capabilities`,
    },
  ];
}

/**
 * Keys written by app versions before 0.8.1, when the capabilities values were
 * created as subkeys. Leaving them behind is harmless but confusing, so every
 * registration run removes them first.
 */
export function legacyAssociationKeys(scope = "user") {
  const k = keys(scope);
  const old = legacyKeys(scope);
  return [
    `${k.capabilities}\\ApplicationName`,
    `${k.capabilities}\\ApplicationDescription`,
    `${k.capabilities}\\ApplicationIcon`,
    `${k.capabilities}\\FileAssociations\\.pdf`,
    `${k.applications}\\SupportedTypes\\.pdf`,
    old.progId,
    `${old.progId}\\DefaultIcon`,
    `${old.progId}\\shell\\open\\command`,
    old.applications,
    `${old.applications}\\FriendlyAppName`,
    `${old.applications}\\DefaultIcon`,
    `${old.applications}\\shell\\open\\command`,
    `${old.applications}\\SupportedTypes`,
    old.capabilitiesRoot,
  ];
}

async function registrationState(scope) {
  const k = keys(scope);
  const command = lastValue(await query(k.command));
  const name = lastValue(await query(k.capabilities, "ApplicationName"));
  const pdfProgId = lastValue(await query(`${k.capabilities}\\FileAssociations`, ".pdf"));
  const capabilities = lastValue(await query(k.registered, PDF_APPLICATION_NAME));
  const expectedCapabilities = `Software\\${CAPABILITIES_ROOT}\\Capabilities`.toLowerCase();
  return {
    command,
    complete:
      Boolean(command) &&
      // reg.exe writes the OEM code page on Chinese Windows, so compare the
      // presence of the value instead of its (possibly mojibaked) bytes.
      Boolean(name) &&
      pdfProgId?.toLowerCase() === PDF_PROG_ID.toLowerCase() &&
      capabilities?.replace(/\//g, "\\").toLowerCase() === expectedCapabilities,
  };
}

export async function pdfAssociationStatus(exePath) {
  const [machine, user] = await Promise.all([
    registrationState("machine"),
    registrationState("user"),
  ]);
  const scope = machine.complete
    ? "machine"
    : user.complete
      ? "user"
      : machine.command
        ? "machine"
        : user.command
          ? "user"
          : null;
  const command = scope === "machine" ? machine.command : user.command;
  const stale = Boolean(command && !normalized(command).includes(normalized(exePath)));
  const currentDefault = progId(await query(keys("user").userChoice, "ProgId"));
  return {
    supported: true,
    // `registered` means Windows can list the app in Default Apps, not merely
    // that a ProgID command exists.
    registered: machine.complete || user.complete,
    scope,
    stale,
    isDefault:
      currentDefault === PDF_PROG_ID ||
      currentDefault?.toLowerCase() === `applications\\${PDF_EXE_NAME.toLowerCase()}` ||
      currentDefault === LEGACY_PROG_ID ||
      currentDefault?.toLowerCase() === `applications\\${LEGACY_EXE_NAME.toLowerCase()}`,
    currentDefault,
    appName: PDF_APPLICATION_NAME,
  };
}

const SHELL_NOTIFY_SCRIPT = [
  "Add-Type -Namespace Wenshu -Name ShellNotify -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);'",
  "[Wenshu.ShellNotify]::SHChangeNotify(0x08000000,0,[IntPtr]::Zero,[IntPtr]::Zero)",
].join("; ");

async function notifyShell() {
  try {
    await exec(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", SHELL_NOTIFY_SCRIPT], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
  } catch {
    // Best effort: Explorer picks the registration up on its next refresh.
  }
}

export async function registerPdfAssociation(exePath, scope = "user") {
  if (!existsSync(exePath)) throw new Error("找不到当前应用的可执行文件");
  for (const key of legacyAssociationKeys(scope)) {
    await removeKey(key);
  }
  const k = keys(scope);
  await removeValue(k.registered, LEGACY_APPLICATION_NAME);
  await removeValue(k.registered, "PaperReader");
  await removeValue(k.openWith, LEGACY_PROG_ID);
  for (const entry of associationEntries(exePath, scope)) {
    await add(entry.key, entry.value, entry.type, entry.name);
  }
  await notifyShell();
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

/**
 * Drop the per-user Default Apps listing after a machine-wide registration.
 * Windows lists HKCU and HKLM registrations separately, so leaving both makes
 * the same application appear twice. The per-user ProgID stays as a fallback.
 */
export async function removeUserPdfRegistration() {
  const k = keys("user");
  await removeValue(k.registered, PDF_APPLICATION_NAME);
  await removeValue(k.registered, LEGACY_APPLICATION_NAME);
  await removeValue(k.registered, "PaperReader");
  await removeKey(k.capabilitiesRoot);
  await removeKey(legacyKeys("user").capabilitiesRoot);
}

export async function removePdfAssociation(exePath, scope = "user") {
  const status = await pdfAssociationStatus(exePath);
  if (status.isDefault) {
    throw new Error("文疏当前是默认 PDF 应用，请先在 Windows 设置中改为其他应用，再移除关联。");
  }
  const k = keys(scope);
  for (const key of legacyAssociationKeys(scope)) {
    await removeKey(key);
  }
  await removeKey(k.progId);
  await removeKey(k.applications);
  await removeKey(k.capabilitiesRoot);
  await removeValue(k.registered, PDF_APPLICATION_NAME);
  await removeValue(k.registered, LEGACY_APPLICATION_NAME);
  await removeValue(k.registered, "PaperReader");
  await removeValue(k.openWith, PDF_PROG_ID);
  await removeValue(k.openWith, LEGACY_PROG_ID);
  return pdfAssociationStatus(exePath);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Turn `HKLM\Software\...` into the PowerShell provider path `HKLM:\Software\...`. */
function registryProviderPath(key) {
  return key.replace(/^HKLM\\/i, "HKLM:\\").replace(/^HKCU\\/i, "HKCU:\\");
}

/**
 * Build the PowerShell script used for the elevated HKLM registration or
 * removal. String values go through the registry provider because PowerShell
 * 5.1 mangles embedded quotes when they are passed to reg.exe as command-line
 * arguments; REG_NONE values have no data and still use reg.exe.
 */
export function associationPowerShellScript({ exePath, scope = "machine", mode = "register" }) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "$reg = Join-Path $env:SystemRoot 'System32\\reg.exe'",
  ];
  if (mode === "register") {
    for (const key of legacyAssociationKeys(scope)) {
      lines.push(
        `Remove-Item -Path ${psQuote(registryProviderPath(key))} -Recurse -Force -ErrorAction SilentlyContinue`,
      );
    }
    lines.push(
      `Remove-ItemProperty -Path '${registryProviderPath(keys(scope).registered)}' -Name ${psQuote(LEGACY_APPLICATION_NAME)} -Force -ErrorAction SilentlyContinue`,
    );
    lines.push(
      `Remove-ItemProperty -Path '${registryProviderPath(keys(scope).registered)}' -Name 'PaperReader' -Force -ErrorAction SilentlyContinue`,
    );
    for (const entry of associationEntries(exePath, scope)) {
      if (entry.type === "REG_NONE") {
        const args = ["& $reg", "add", psQuote(entry.key)];
        if (entry.name) args.push("/v", psQuote(entry.name));
        else args.push("/ve");
        args.push("/t", "REG_NONE", "/f");
        lines.push(args.join(" "));
        lines.push(
          `if ($LASTEXITCODE -ne 0) { throw ${psQuote(`registry write failed: ${entry.key}`)} }`,
        );
        continue;
      }
      const providerPath = registryProviderPath(entry.key);
      const valueName = entry.name ? psQuote(entry.name) : "'(default)'";
      lines.push(`$key = ${psQuote(providerPath)}`);
      // New-Item -Force recreates an existing registry key and wipes every
      // value in it; only create the key when it is really absent.
      lines.push("if (-not (Test-Path -Path $key)) { New-Item -Path $key -Force | Out-Null }");
      lines.push(
        `Set-ItemProperty -Path $key -Name ${valueName} -Value ${psQuote(entry.value ?? "")}`,
      );
    }
    // A Start Menu link makes the portable build look like an installed app,
    // which Windows 11's Default Apps page expects when listing Win32 entries.
    // Per-user installs belong in the user's Start Menu; a previous system-wide
    // MSI may have left a broken common link, so remove that stale copy.
    if (scope === "machine") {
      lines.push(
        "$commonStartMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonStartMenu)",
      );
      for (const name of [PDF_APPLICATION_NAME, LEGACY_APPLICATION_NAME, "PaperReader"]) {
        lines.push(`$oldCommon = Join-Path $commonStartMenu ${psQuote(`${name}.lnk`)}`);
        lines.push(
          "if (Test-Path $oldCommon) { Remove-Item -Path $oldCommon -Force -ErrorAction SilentlyContinue }",
        );
      }
    }
    lines.push("$startMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::StartMenu)");
    lines.push(`$lnkPath = Join-Path $startMenu ${psQuote(`${PDF_APPLICATION_NAME}.lnk`)}`);
    for (const name of [LEGACY_APPLICATION_NAME, "PaperReader"]) {
      lines.push(`$legacyLnk = Join-Path $startMenu ${psQuote(`${name}.lnk`)}`);
      lines.push(
        "if (Test-Path $legacyLnk) { Remove-Item -Path $legacyLnk -Force -ErrorAction SilentlyContinue }",
      );
    }
    lines.push("try {");
    lines.push(
      "  if (Test-Path $lnkPath) { Remove-Item -Path $lnkPath -Force -ErrorAction SilentlyContinue }",
    );
    lines.push("  $ws = New-Object -ComObject WScript.Shell");
    lines.push("  $lnk = $ws.CreateShortcut($lnkPath)");
    lines.push(`  $lnk.TargetPath = ${psQuote(exePath)}`);
    lines.push(`  $lnk.WorkingDirectory = ${psQuote(path.dirname(exePath))}`);
    lines.push(`  $lnk.IconLocation = ${psQuote(`${exePath},0`)}`);
    lines.push("  $lnk.Save()");
    lines.push("} catch {");
    lines.push("  [Console]::Error.WriteLine('shortcut skipped: ' + $_.Exception.Message)");
    lines.push("}");
  } else {
    const removals = associationRemovals(scope);
    for (const key of removals.keys) {
      lines.push(
        `Remove-Item -Path ${psQuote(registryProviderPath(key))} -Recurse -Force -ErrorAction SilentlyContinue`,
      );
    }
    for (const [key, name] of removals.values) {
      lines.push(
        `Remove-ItemProperty -Path ${psQuote(registryProviderPath(key))} -Name ${psQuote(name)} -Force -ErrorAction SilentlyContinue`,
      );
    }
    lines.push("$startMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::StartMenu)");
    for (const name of [PDF_APPLICATION_NAME, LEGACY_APPLICATION_NAME]) {
      lines.push(`$lnk = Join-Path $startMenu ${psQuote(`${name}.lnk`)}`);
      lines.push("Remove-Item -Path $lnk -Force -ErrorAction SilentlyContinue");
    }
    if (scope === "machine") {
      lines.push(
        "$commonStartMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonStartMenu)",
      );
      for (const name of [PDF_APPLICATION_NAME, LEGACY_APPLICATION_NAME, "PaperReader"]) {
        lines.push(`$commonLnk = Join-Path $commonStartMenu ${psQuote(`${name}.lnk`)}`);
        lines.push("Remove-Item -Path $commonLnk -Force -ErrorAction SilentlyContinue");
      }
    }
  }
  // Tell Explorer that associations changed so "Open with" and the Default
  // Apps page refresh without a sign-out.
  lines.push("try {");
  lines.push(
    "  Add-Type -Namespace Wenshu -Name ShellNotify -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);'",
  );
  lines.push("  [Wenshu.ShellNotify]::SHChangeNotify(0x08000000,0,[IntPtr]::Zero,[IntPtr]::Zero)");
  lines.push("} catch { }");
  return lines.join("\r\n");
}

export function associationRemovals(scope = "user") {
  const k = keys(scope);
  const old = legacyKeys(scope);
  return {
    keys: [
      k.progId,
      k.applications,
      k.capabilitiesRoot,
      old.progId,
      old.applications,
      old.capabilitiesRoot,
    ],
    values: [
      [k.registered, PDF_APPLICATION_NAME],
      [k.registered, LEGACY_APPLICATION_NAME],
      [k.registered, "PaperReader"],
      [k.openWith, PDF_PROG_ID],
      [k.openWith, LEGACY_PROG_ID],
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
