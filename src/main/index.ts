import {app,BrowserWindow,ipcMain,dialog,session as electronSession} from 'electron';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './db';import {seed} from './seed';import {PromptService} from './prompt-service';import {Session} from './session';import {dispatch} from './ipc';import bundle from '../../resources/default-prompts.json';
// An explicit data directory also lets automated smoke tests avoid touching user data.
if(process.env.VN_POCHTA_DATA_DIR)app.setPath('userData',process.env.VN_POCHTA_DATA_DIR);
app.whenReady().then(()=>{
 const db=openDatabase(join(app.getPath('userData'),'vn-pochta.db'));seed(db,bundle);const service=new PromptService(db),session=new Session();
 const page=join(__dirname,'../renderer/index.html');const pageUrl=pathToFileURL(page).href;
 electronSession.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 const win=new BrowserWindow({width:1380,height:900,minWidth:480,minHeight:560,title:'VN ПОЧТА',backgroundColor:'#f6f6f5',webPreferences:{preload:join(__dirname,'../preload/index.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
 ipcMain.handle('vn:request',(event,method,args)=>{const trusted=event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame?.url===pageUrl;try{return dispatch({db,service,session},trusted,method,args)}catch(error){if(error instanceof Error&&error.name==='ZodError')throw new Error('Dữ liệu không hợp lệ. Kiểm tra tên, nội dung và độ dài các trường.');throw error}});
 win.on('close',event=>{if(session.dirty){const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['Tiếp tục sửa','Bỏ thay đổi và đóng'],defaultId:0,cancelId:0,message:'Bạn có thay đổi chưa lưu.'});if(choice===0)event.preventDefault();else session.dirty=false}});
 void win.loadFile(page);app.once('will-quit',()=>db.close());
});
app.on('window-all-closed',()=>app.quit());
