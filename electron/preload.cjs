const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperReader", {
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
});
