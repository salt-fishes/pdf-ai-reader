const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperReader", {
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
