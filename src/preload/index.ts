import {contextBridge,ipcRenderer} from 'electron';
import type {Bridge} from '../shared/contracts';
const invoke=(method:string,...args:unknown[])=>ipcRenderer.invoke('vn:request',method,args);
const api:Bridge={session:()=>invoke('session'),switchSeller:s=>invoke('switchSeller',s),list:()=>invoke('list'),get:id=>invoke('get',id),create:p=>invoke('create',p),save:(id,p)=>invoke('save',id,p),clone:id=>invoke('clone',id),remove:id=>invoke('remove',id),versions:id=>invoke('versions',id),restore:(id,v)=>invoke('restore',id,v),reset:id=>invoke('reset',id),favorite:(id,v)=>invoke('favorite',id,v),setDefault:(mode,id)=>invoke('setDefault',mode,id),defaults:()=>invoke('defaults'),markUsed:id=>invoke('markUsed',id),importJson:json=>invoke('importJson',json),exportJson:ids=>invoke('exportJson',ids),setDirty:v=>invoke('setDirty',v)};
contextBridge.exposeInMainWorld('vnPochta',api);
