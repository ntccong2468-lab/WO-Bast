import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared/contracts';
const invoke = (method: string, ...args: unknown[]) =>
  ipcRenderer.invoke('vn:request', method, args);
const studioInvoke = (method: string, ...args: unknown[]) =>
  ipcRenderer.invoke('vn:studio', method, args);
const api: Bridge = {
  studio: {
    preview: (id) => studioInvoke('preview', id),
    assets: () => studioInvoke('assets'),
    importImages: () => studioInvoke('importImages'),
    analyze: (assetIds) => studioInvoke('analyze', assetIds),
    productProfile: () => studioInvoke('productProfile'),
    saveProductSize: (size) => studioInvoke('saveProductSize', size),
    thumbnail: (id) => studioInvoke('thumbnail', id),
    prepare: (r) => studioInvoke('prepare', r),
    create: (r) => studioInvoke('create', r),
    run: (id) => studioInvoke('run', id),
    list: () => studioInvoke('list'),
    get: (id) => studioInvoke('get', id),
    review: (id, d, c) => studioInvoke('review', id, d, c),
    retryAudit: (id) => studioInvoke('retryAudit', id),
    cancelQueued: (id) => studioInvoke('cancelQueued', id),
    exportApproved: (id) => studioInvoke('exportApproved', id),
  },
  credentials: {
    status: () => studioInvoke('credentialStatus'),
    save: (key) => studioInvoke('credentialSave', key),
    remove: () => studioInvoke('credentialRemove'),
    checkConnection: () => studioInvoke('checkConnection'),
  },
  session: () => invoke('session'),
  switchSeller: (s) => invoke('switchSeller', s),
  list: () => invoke('list'),
  get: (id) => invoke('get', id),
  create: (p) => invoke('create', p),
  save: (id, p) => invoke('save', id, p),
  clone: (id) => invoke('clone', id),
  remove: (id) => invoke('remove', id),
  versions: (id) => invoke('versions', id),
  restore: (id, v) => invoke('restore', id, v),
  reset: (id) => invoke('reset', id),
  favorite: (id, v) => invoke('favorite', id, v),
  setDefault: (mode, id) => invoke('setDefault', mode, id),
  defaults: () => invoke('defaults'),
  markUsed: (id) => invoke('markUsed', id),
  importJson: (json) => invoke('importJson', json),
  exportJson: (ids) => invoke('exportJson', ids),
  saveExport: (ids) => ipcRenderer.invoke('vn:export', ids),
  setDirty: (v) => invoke('setDirty', v),
};
contextBridge.exposeInMainWorld('vnPochta', api);
