import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { associationPowerShellScript } from "../../electron/pdf-association.mjs";

// A path with a space exercises the same quoting on every CI platform.
const exePath = resolve("Paper Reader", "PaperReader.exe");

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

  it("uses provider removals and deletes the common Start Menu link", () => {
    const script = associationPowerShellScript({ exePath, scope: "machine", mode: "remove" });
    expect(script).toContain("Remove-Item -Path 'HKLM:\\Software\\Classes\\PaperReader.pdf'");
    expect(script).toContain("Remove-ItemProperty");
    expect(script).toContain("CommonStartMenu");
    expect(script).toContain("'纸间.lnk'");
  });
});
