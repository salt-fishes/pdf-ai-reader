const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperReader", {
  isDesktop: true,
  platform: process.platform,
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  pdfAssociation: {
    status: () => ipcRenderer.invoke("app:pdf-association-status"),
    register: (scope) => ipcRenderer.invoke("app:pdf-association-register", scope),
    remove: (scope) => ipcRenderer.invoke("app:pdf-association-remove", scope),
    openSettings: () => ipcRenderer.invoke("app:pdf-association-open-settings"),
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  setTitleBarTheme: (dark) => ipcRenderer.invoke("window:set-titlebar-theme", Boolean(dark)),
  takePendingPdf: () => ipcRenderer.invoke("app:take-pending-pdf"),
  onOpenPdf: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:open-pdf", listener);
    return () => ipcRenderer.removeListener("app:open-pdf", listener);
  },
  rendererReady: () => ipcRenderer.send("app:renderer-ready"),
  openDataFolder: () => ipcRenderer.invoke("app:open-data-folder"),
});
