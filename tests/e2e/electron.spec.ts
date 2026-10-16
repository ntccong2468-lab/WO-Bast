import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
let app: ElectronApplication;
let dir: string;
let child: ReturnType<ElectronApplication['process']>;
async function launch() {
  const launched = await electron.launch({
    args: [...(process.env.VN_POCHTA_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '.'],
    env: { ...process.env, VN_POCHTA_DATA_DIR: dir },
  });
  child = launched.process();
  return launched;
}
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pochta-e2e-'));
});
test.afterEach(async () => {
  if (child && child.exitCode === null) child.kill();
  rmSync(dir, { recursive: true, force: true });
});
test('real Electron + SQLite: seed, edit, seller isolation, reopen and secure bridge', async () => {
  app = await launch();
  let page = await app.firstWindow();
  await expect(page.locator('.prompt-card')).toHaveCount(9);
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    (
      BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): {
          nodeIntegration: boolean;
          contextIsolation: boolean;
          sandbox: boolean;
        };
      }
    ).getLastWebPreferences(),
  );
  expect(prefs.nodeIntegration).toBe(false);
  expect(prefs.contextIsolation).toBe(true);
  expect(prefs.sandbox).toBe(true);
  expect(
    await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
  ).toBe('undefined');
  await page.getByRole('button', { name: /Ảnh chính sản phẩm/ }).click();
  await page.getByLabel('Nội dung prompt', { exact: true }).fill('Durable Unicode Привет áo');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu prompt.', { exact: true })).toBeVisible();
  await expect(page.locator('.prompt-card')).toHaveCount(10);
  await page.getByLabel('Seller hiện hành').selectOption('seller-b');
  await expect(page.locator('.prompt-card')).toHaveCount(9);
  expect(
    await page.evaluate(() =>
      window.vnPochta.list().then((ps) => ps.some((p) => p.body === 'Durable Unicode Привет áo')),
    ),
  ).toBe(false);
  await page.getByLabel('Seller hiện hành').selectOption('seller-a');
  await expect(page.locator('.prompt-card')).toHaveCount(10);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(page.locator('.prompt-card')).toHaveCount(10);
  expect(
    await page.evaluate(() =>
      window.vnPochta.list().then((ps) => ps.some((p) => p.body === 'Durable Unicode Привет áo')),
    ),
  ).toBe(true);
});
test('narrow and wide windows keep controls reachable and lists scrollable', async () => {
  app = await launch();
  const page = await app.firstWindow();
  await expect(page.locator('.prompt-card')).toHaveCount(9);
  for (const width of [640, 1280]) {
    await app.evaluate(
      ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 800),
      width,
    );
    await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const list = page.locator('.prompt-list');
    expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await page.getByRole('button', { name: 'Lưu', exact: true }).scrollIntoViewIfNeeded();
  }
  await page.screenshot({ path: 'test-results/prompt-library.png', fullPage: true });
});
test('closing a dirty editor asks once, cancel retains it, discard closes it', async () => {
  app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();
  await page.getByLabel('Nội dung prompt', { exact: true }).fill('Unsaved close draft');
  await expect
    .poll(() => page.evaluate(() => window.vnPochta.session().then(() => true)))
    .toBe(true);
  await app.evaluate(({ dialog, BrowserWindow }) => {
    (globalThis as any).messages = 0;
    dialog.showMessageBoxSync = () => {
      (globalThis as any).messages++;
      return 0;
    };
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect.poll(() => app.evaluate(() => (globalThis as any).messages)).toBe(1);
  await expect(page.getByLabel('Nội dung prompt', { exact: true })).toHaveValue(
    'Unsaved close draft',
  );
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBoxSync = () => {
      (globalThis as any).messages++;
      return 1;
    };
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect.poll(() => page.isClosed()).toBe(true);
});
test('complete library interactions: create, default, version restore, JSON, reset and delete', async () => {
  app = await launch();
  const page = await app.firstWindow();
  page.on('dialog', (d) => d.accept());
  await expect(page.locator('.prompt-card')).toHaveCount(9);
  await page.getByRole('button', { name: /Ảnh chính sản phẩm/ }).click();
  await page.getByLabel('Nội dung prompt', { exact: true }).fill('First saved body');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu prompt.', { exact: true })).toBeVisible();
  await page.getByLabel('Nội dung prompt', { exact: true }).fill('Second body');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu prompt.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đặt làm mặc định của tôi', exact: true }).click();
  await expect(page.getByText('Mặc định của tôi: hero_image', { exact: true })).toBeVisible();
  await page.getByText(/v1 ·/).click();
  await page.getByRole('button', { name: 'Khôi phục v1', exact: true }).click();
  await expect(page.getByLabel('Nội dung prompt', { exact: true })).toHaveValue('First saved body');
  await page.getByRole('button', { name: 'Khôi phục prompt mặc định', exact: true }).click();
  await expect(page.getByLabel('Nội dung prompt', { exact: true })).toContainText(
    'Create a premium',
  );
  const path = join(dir, 'export.json');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, path);
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  await expect
    .poll(() => {
      try {
        return JSON.parse(readFileSync(path, 'utf8')).prompts.length;
      } catch {
        return 0;
      }
    })
    .toBe(1);
  await page.getByLabel('Tệp JSON', { exact: true }).setInputFiles(path);
  await expect(page.getByText('Đã nhập 1 prompt cá nhân.', { exact: true })).toBeVisible();
  await expect(page.locator('.prompt-card')).toHaveCount(11);
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.locator('.prompt-card')).toHaveCount(10);
});
