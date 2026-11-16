const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperReader", {
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  pdfAssociation: {
    status: () => ipcRenderer.invoke("app:pdf-association-status"),
    register: () => ipcRenderer.invoke("app:pdf-association-register"),
    remove: () => ipcRenderer.invoke("app:pdf-association-remove"),
    openSettings: () => ipcRenderer.invoke("app:pdf-association-open-settings"),
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
