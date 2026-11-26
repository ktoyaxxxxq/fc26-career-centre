const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('careerDesktop', {
  state: () => ipcRenderer.invoke('career:state'),
  choose: () => ipcRenderer.invoke('career:choose'),
  resume: () => ipcRenderer.invoke('career:resume'),
  images: () => ipcRenderer.invoke('career:images'),
  linkArchive: id => ipcRenderer.invoke('career:linkArchive', id),
  importArchive: () => ipcRenderer.invoke('career:importArchive'),
  telemetry: (matchId, rows) => ipcRenderer.invoke('career:telemetry', matchId, rows),
  hide: () => ipcRenderer.invoke('career:hide'),
  reveal: () => ipcRenderer.invoke('career:reveal'),
  worldNews: () => ipcRenderer.invoke('career:worldNews'),
  openNews: url => ipcRenderer.invoke('career:openNews', url),
  copyPlan: text => ipcRenderer.invoke('career:copyPlan', text),
  startup: enabled => ipcRenderer.invoke('career:startup', enabled),
  openGame: () => ipcRenderer.invoke('career:openGame'),
  returnGame: () => ipcRenderer.invoke('career:returnGame'),
  bindGame: action => ipcRenderer.invoke('career:bindGame', action),
  cancelBinding: () => ipcRenderer.invoke('career:cancelBinding'),
  gameAction: action => ipcRenderer.invoke('career:gameAction', action),
  chooseGame: path => ipcRenderer.invoke('career:chooseGame', path),
  gameAuto: enabled => ipcRenderer.invoke('career:gameAuto', enabled),
  subscribeGame: listener => {
    ipcRenderer.on('career:game-update', (_event, value) => listener(value));
  },
  subscribe: listener => {
    ipcRenderer.on('career:update', (_event, value) => listener(value));
  },
});
