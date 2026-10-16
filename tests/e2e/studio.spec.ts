import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
let app: ElectronApplication;
let dir: string;
let child: ReturnType<ElectronApplication['process']>;
async function launch() {
  const a = await electron.launch({
    args: [...(process.env.VN_POCHTA_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '.'],
    env: { ...process.env, VN_POCHTA_DATA_DIR: dir, VN_POCHTA_OPENAI_KEY: '', OPENAI_API_KEY: '' },
  });
  child = a.process();
  return a;
}
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio-e2e-'));
});
test.afterEach(() => {
  if (child && child.exitCode === null) child.kill();
  rmSync(dir, { recursive: true, force: true });
});
test('Studio imports source through native dialog, previews prompt without API, persists and isolates sellers', async () => {
  const file = join(dir, 'source.png');
  writeFileSync(
    file,
    await sharp({ create: { width: 120, height: 160, channels: 3, background: '#eeeeee' } })
      .png()
      .toBuffer(),
  );
  app = await launch();
  let page = await app.firstWindow();
  await page.getByTitle('AI Studio', { exact: true }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, file);
  await page.getByRole('button', { name: '+ Tải ảnh nguồn', exact: true }).click();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  await expect(page.locator('.asset-card img')).toBeVisible();
  await page.getByLabel('Prompt tạo ảnh', { exact: true }).selectOption('hero_image');
  await page.getByRole('button', { name: 'Xem trước prompt', exact: true }).click();
  await expect(page.locator('.studio-page pre')).toContainText(
    'Create a premium e-commerce hero image',
  );
  await expect(page.getByRole('button', { name: /Tạo ảnh ·/ })).toBeDisabled();
  await expect(
    page.getByText('Chưa có khóa API. Mở Cấu hình để nhập và kiểm tra khóa trước khi tạo ảnh.'),
  ).toBeVisible();
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByTitle('AI Studio', { exact: true }).click();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  await page.getByLabel('Seller hiện hành').selectOption('seller-b');
  await expect(page.locator('.asset-card')).toHaveCount(0);
  await expect(page.getByText('Chưa có ảnh nguồn. Chọn ảnh thật để bắt đầu.')).toBeVisible();
});
test('API settings keep credential private and Studio fits desktop sizes', async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.getByTitle('Cấu hình', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cấu hình OpenAI' })).toBeVisible();
  await expect(page.getByText('Chưa có khóa API', { exact: true })).toBeVisible();
  expect(await page.getByLabel('Khóa OpenAI API').getAttribute('type')).toBe('password');
  await page.getByTitle('AI Studio', { exact: true }).click();
  for (const width of [640, 1280]) {
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 800),
      width,
    );
    await expect(page.getByRole('button', { name: '+ Tải ảnh nguồn', exact: true })).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/ai-studio.png', fullPage: true });
});
