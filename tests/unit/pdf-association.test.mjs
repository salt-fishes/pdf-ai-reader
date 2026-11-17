import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  associationEntries,
  associationPowerShellScript,
  legacyAssociationKeys,
} from "../../electron/pdf-association.mjs";

// A path with a space exercises the same quoting on every CI platform.
const exePath = resolve("Paper Reader", "PaperReader.exe");
const capabilities = "HKLM\\Software\\PaperReader\\Capabilities";

describe("associationEntries", () => {
  it("writes capability metadata as values, not subkeys", () => {
    const entries = associationEntries(exePath, "machine");
    expect(entries).toContainEqual({
      key: capabilities,
      name: "ApplicationName",
      value: "纸间",
    });
    expect(entries).toContainEqual({
      key: capabilities,
      name: "ApplicationDescription",
      value: expect.any(String),
    });
    expect(entries).toContainEqual({
      key: capabilities,
      name: "ApplicationIcon",
      value: `${exePath},0`,
    });
    expect(entries).toContainEqual({
      key: `${capabilities}\\FileAssociations`,
      name: ".pdf",
      value: "PaperReader.pdf",
    });
    // Windows ignores the whole Default Apps entry when these are keys.
    expect(entries.some((entry) => entry.key === `${capabilities}\\ApplicationName`)).toBe(false);
    expect(entries.some((entry) => entry.key === `${capabilities}\\ApplicationIcon`)).toBe(false);
    expect(entries.some((entry) => entry.key === `${capabilities}\\FileAssociations\\.pdf`)).toBe(
      false,
    );
  });

  it("uses the shipped PDF icon for documents and the exe icon for the app", () => {
    const dir = mkdtempSync(join(tmpdir(), "paper-reader-icon-"));
    try {
      const exe = join(dir, "PaperReader.exe");
      const ico = join(dir, "pdf-file.ico");
      writeFileSync(ico, "ico");
      const entries = associationEntries(exe, "user");
      expect(entries).toContainEqual({
        key: "HKCU\\Software\\Classes\\PaperReader.pdf\\DefaultIcon",
        value: `${ico},0`,
      });
      expect(entries).toContainEqual({
        key: "HKCU\\Software\\Classes\\Applications\\PaperReader.exe\\DefaultIcon",
        value: `${exe},0`,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the exe icon when pdf-file.ico is not shipped", () => {
    const entries = associationEntries(exePath, "machine");
    expect(entries).toContainEqual({
      key: "HKLM\\Software\\Classes\\PaperReader.pdf\\DefaultIcon",
      value: `${exePath},0`,
    });
  });

  it("lists every malformed key left by older versions", () => {
    expect(legacyAssociationKeys("machine")).toEqual([
      `${capabilities}\\ApplicationName`,
      `${capabilities}\\ApplicationDescription`,
      `${capabilities}\\ApplicationIcon`,
      `${capabilities}\\FileAssociations\\.pdf`,
      "HKLM\\Software\\Classes\\Applications\\PaperReader.exe\\SupportedTypes\\.pdf",
    ]);
  });
});

describe("associationPowerShellScript", () => {
  it("writes quoted command values through the registry provider", () => {
    const script = associationPowerShellScript({ exePath, scope: "machine", mode: "register" });
    expect(script).toContain("Set-ItemProperty");
    expect(script).toContain(`-Value '"${exePath}" "%1"'`);
    // reg.exe /d would split the embedded quotes on PowerShell 5.1.
    expect(script).not.toContain(
      "& $reg add 'HKLM\\Software\\Classes\\PaperReader.pdf\\shell\\open\\command'",
    );
    expect(script).toContain("oldCommon");
    expect(script).toContain("SpecialFolder]::StartMenu");
    expect(script).toContain("'纸间.lnk'");
  });

  it("repairs legacy keys and writes capability values", () => {
    const script = associationPowerShellScript({ exePath, scope: "machine", mode: "register" });
    for (const key of legacyAssociationKeys("machine")) {
      const providerPath = key.replace(/^HKLM\\/, "HKLM:\\");
      expect(script).toContain(
        `Remove-Item -Path '${providerPath}' -Recurse -Force -ErrorAction SilentlyContinue`,
      );
    }
    expect(script).toContain("-Name 'ApplicationName' -Value '纸间'");
    // New-Item -Force recreates a key and deletes the values written before it.
    expect(script).toContain(
      "if (-not (Test-Path -Path $key)) { New-Item -Path $key -Force | Out-Null }",
    );
    expect(script).toContain("SHChangeNotify");
  });

  it("uses provider removals and deletes the common Start Menu link", () => {
    const script = associationPowerShellScript({ exePath, scope: "machine", mode: "remove" });
    expect(script).toContain("Remove-Item -Path 'HKLM:\\Software\\Classes\\PaperReader.pdf'");
    expect(script).toContain("Remove-ItemProperty");
    expect(script).toContain("CommonStartMenu");
    expect(script).toContain("'纸间.lnk'");
  });
});
