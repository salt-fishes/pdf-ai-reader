import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

// electron-builder 26 normally executes the intermediate NSIS installer to
// obtain its uninstaller. AppLocker and controlled-folder policies can block
// that execution even though makensis succeeded. Its macOS path already uses
// the bundled binary reader, so use the same extraction path on Windows.
if (process.platform === "win32") {
  const macosVersion = require("app-builder-lib/out/util/macosVersion.js");
  macosVersion.isMacOsCatalina = () => true;
}

const globalElectron = join(homedir(), "AppData", "Roaming", "npm", "node_modules", "electron");
const globalDist = join(globalElectron, "dist");
const globalPackage = join(globalElectron, "package.json");
const localPackage = join(process.cwd(), "node_modules", "electron", "package.json");

let electronVersion;
let electronDist = null;

if (!process.env.CI && existsSync(globalPackage) && existsSync(globalDist)) {
  electronVersion = JSON.parse(readFileSync(globalPackage, "utf8")).version;
  electronDist = globalDist;
} else if (existsSync(localPackage)) {
  // CI installs Electron locally. Local development always uses the global
  // copy above and never installs or downloads another Electron runtime.
  electronVersion = JSON.parse(readFileSync(localPackage, "utf8")).version;
} else {
  throw new Error("Electron was not found in the global npm directory or node_modules.");
}

process.env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
process.env.npm_config_electron_skip_binary_download = "1";

const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length > 0 ? requestedTargets : ["nsis", "msiWrapped"];
const { build } = await import("electron-builder");

await build({
  win: targets,
  x64: true,
  publish: "never",
  config: {
    electronVersion,
    ...(electronDist ? { electronDist } : {}),
  },
});
