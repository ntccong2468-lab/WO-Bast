// @vitest-environment jsdom
import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StudioPage } from '../../src/renderer/studio/StudioPage';
import { ApiSettings } from '../../src/renderer/studio/ApiSettings';
import bundle from '../../resources/default-prompts.json';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function bridge() {
  const prompt = {
    id: 'hero_image',
    source: 'system',
    name: 'Ảnh chính sản phẩm',
    category: 'image',
    body: 'Use reference',
    version: 1,
    tags: [],
    mode: 'hero_image',
  };
  return {
    list: vi.fn(async () => [prompt]),
    credentials: {
      status: vi.fn(async () => ({ source: 'none', configured: false, canStore: true })),
      save: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      checkConnection: vi.fn(async () => ({ ok: false, errorCode: 'invalid_api_key' })),
    },
    studio: {
      assets: vi.fn(async () => [
        { id: 'asset1', mime: 'image/png', width: 10, height: 10, sha256: 'x', createdAt: '' },
      ]),
      list: vi.fn(async () => []),
      thumbnail: vi.fn(async () => 'data:image/png;base64,eA=='),
      importImages: vi.fn(async () => []),
      prepare: vi.fn(async () => [{ finalPrompt: 'Final preview' }]),
      create: vi.fn(async () => []),
      run: vi.fn(async () => {}),
    },
  } as any;
}
test('source selection and prompt preview work without a key; generate remains blocked', async () => {
  window.vnPochta = bridge();
  render(<StudioPage seller="seller-a" selectedPromptId="hero_image" />);
  await screen.findByText('Ảnh chính sản phẩm');
  fireEvent.click(await screen.findByLabelText('Chọn ảnh nguồn asset1'));
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước prompt' }));
  await screen.findByText('Final preview');
  expect(window.vnPochta.studio.create).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: /Tạo ảnh/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
test('password clears after submit and API check shows safe status', async () => {
  window.vnPochta = bridge();
  render(<ApiSettings seller="seller-a" />);
  await screen.findByText('Chưa có khóa API');
  const field = screen.getByLabelText('Khóa OpenAI API');
  fireEvent.change(field, { target: { value: 'fixture-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu khóa an toàn' }));
  await waitFor(() => expect((field as HTMLInputElement).value).toBe(''));
  expect(window.vnPochta.credentials.save).toHaveBeenCalledWith('fixture-key');
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await screen.findByText(/không chấp nhận khóa/);
});
