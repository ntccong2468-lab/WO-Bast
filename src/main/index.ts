import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  dialog,
  session as electronSession,
  shell,
} from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './db';
import { seed } from './seed';
import { PromptService } from './prompt-service';
import { Session } from './session';
import { dispatch } from './ipc';
import { AssetStore } from './studio/assets';
import { CredentialStore } from './studio/credentials';
import { StudioJobs } from './studio/jobs';
import { OpenAIStudioAdapter } from './studio/openai-adapter';
import { ProductProfileStore } from './studio/profiles';
import { dispatchStudio, studioErrorMessage } from './studio/ipc';
import { Updater } from './updater';
import bundle from '../../resources/default-prompts.json';
// An explicit data directory also lets automated smoke tests avoid touching user data.
if (process.env.VN_POCHTA_DATA_DIR) app.setPath('userData', process.env.VN_POCHTA_DATA_DIR);
app.whenReady().then(() => {
  const db = openDatabase(join(app.getPath('userData'), 'vn-pochta.db'));
  seed(db, bundle);
  const service = new PromptService(db),
    session = new Session();
  const page = join(__dirname, '../renderer/index.html');
  const pageUrl = pathToFileURL(page).href;
  electronSession.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 480,
    minHeight: 560,
    title: 'VN ПОЧТА',
    backgroundColor: '#f6f6f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const assets = new AssetStore(db, join(app.getPath('userData'), 'assets'));
  const profiles = new ProductProfileStore(db);
  const credentials = new CredentialStore(
    db,
    {
      available: () => safeStorage.isEncryptionAvailable(),
      backend: () =>
        process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os-protected',
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (bytes) => safeStorage.decryptString(bytes),
    },
    process.env,
  );
  const adapter = (seller: import('../shared/contracts').SellerId) =>
    new OpenAIStudioAdapter(credentials, seller);
  const jobs = new StudioJobs(db, service, assets, adapter);
  jobs.recover();
  const updater = new Updater({
    currentVersion: app.getVersion(),
    updatesDir: join(app.getPath('userData'), 'updates'),
    openExternal: (url) => shell.openExternal(url).then(() => {}),
    quit: () => app.quit(),
  });
  ipcMain.handle('vn:update', async (event, method, args) => {
    const trusted =
      event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      event.senderFrame?.url === pageUrl;
    if (!trusted) throw new Error('Yêu cầu cập nhật không hợp lệ.');
    switch (method) {
      case 'check':
        return updater.check();
      case 'download': {
        const unsubscribe = updater.subscribe((info) => {
          if (!win.isDestroyed()) win.webContents.send('vn:update-progress', info);
        });
        try {
          return await updater.download();
        } finally {
          unsubscribe();
        }
      }
      case 'install':
        return updater.install();
      case 'openRelease':
        return updater.openRelease();
      default:
        throw new Error(`Phương thức cập nhật không được hỗ trợ: ${method}`);
    }
  });
  ipcMain.handle('vn:studio', async (event, method, args) => {
    const trusted =
      event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      event.senderFrame?.url === pageUrl;
    const seller = session.seller;
    try {
      return await dispatchStudio(
        {
          assets,
          profiles,
          jobs,
          credentials,
          adapter,
          pickImages: async () => {
            const r = await dialog.showOpenDialog(win, {
              title: 'Chọn ảnh sản phẩm nguồn',
              properties: ['openFile', 'multiSelections'],
              filters: [{ name: 'Ảnh sản phẩm', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
            });
            return r.canceled ? [] : r.filePaths;
          },
          saveImage: async (bytes) => {
            const r = await dialog.showSaveDialog(win, {
              title: 'Xuất ảnh đã duyệt',
              defaultPath: 'vn-pochta-product.png',
              filters: [{ name: 'PNG', extensions: ['png'] }],
            });
            if (r.canceled || !r.filePath) return false;
            await writeFile(r.filePath, bytes);
            return true;
          },
        },
        seller,
        trusted,
        method,
        args,
      );
    } catch (error) {
      throw new Error(studioErrorMessage(error));
    }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  ipcMain.handle('vn:request', (event, method, args) => {
    const trusted =
      event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      event.senderFrame?.url === pageUrl;
    try {
      return dispatch({ db, service, session }, trusted, method, args);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError')
        throw new Error('Dữ liệu không hợp lệ. Kiểm tra tên, nội dung và độ dài các trường.');
      throw error;
    }
  });
  ipcMain.handle('vn:export', async (event, ids) => {
    const trusted =
      event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      event.senderFrame?.url === pageUrl;
    const json = dispatch({ db, service, session }, trusted, 'exportJson', [ids]) as string;
    const result = await dialog.showSaveDialog(win, {
      title: 'Xuất prompt JSON',
      defaultPath: 'vn-pochta-prompts.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, json, 'utf8');
    return true;
  });
  win.webContents.on('will-prevent-unload', (event) => {
    if (session.dirty) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Tiếp tục sửa', 'Bỏ thay đổi và đóng'],
        defaultId: 0,
        cancelId: 0,
        message: 'Bạn có thay đổi chưa lưu.',
      });
      if (choice === 1) {
        session.dirty = false;
        event.preventDefault();
      }
    } else {
      event.preventDefault();
    }
  });
  void win.loadFile(page);
  app.once('will-quit', () => db.close());
});
app.on('window-all-closed', () => app.quit());
