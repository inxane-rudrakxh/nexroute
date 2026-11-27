const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "nexroute",
  Object.freeze({
    getPlans: () => ipcRenderer.invoke("plans:list"),
    createPlan: (input) => ipcRenderer.invoke("plans:create", input),
    deletePlan: (planId) => ipcRenderer.invoke("plans:delete", planId),
    getGeminiStatus: () => ipcRenderer.invoke("gemini:status"),
    saveGeminiKey: (input) => ipcRenderer.invoke("gemini:key-save", input),
    removeGeminiKey: () => ipcRenderer.invoke("gemini:key-remove"),
    openGeminiKeyPage: () => ipcRenderer.invoke("gemini:open-key-page"),
  }),
);
