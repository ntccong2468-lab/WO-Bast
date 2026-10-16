import { JobResult } from '../../src/renderer/studio/JobResult';
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
    defaults: vi.fn(async () => ({})),
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

test('creation form exposes only seller size and Vietnamese ratio choices including 9:16', async () => {
  window.vnPochta = bridge();
  render(<StudioPage seller="seller-a" selectedPromptId="hero_image" />);
  await screen.findByText('Ảnh chính sản phẩm');
  expect(screen.getByLabelText('Kích thước sản phẩm (Size)').getAttribute('placeholder')).toBe(
    'Ví dụ: 48-56; 58-66',
  );
  const ratio = screen.getByLabelText('Tỷ lệ ảnh áp dụng chung') as HTMLSelectElement;
  expect([...ratio.options].map((option) => option.value)).toContain('9:16');
  for (const technical of [
    'product_name',
    'marketplace',
    'category',
    'aspect_ratio',
    'language',
    'verified_attributes',
  ])
    expect(screen.queryByDisplayValue(technical)).toBeNull();
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
test('ordinary Studio selection uses image default while explicit library selection wins', async () => {
  const api = bridge();
  api.defaults = vi.fn(async () => ({ hero_image: 'personal' }));
  api.list = vi.fn(async () => [
    {
      id: 'hero_image',
      source: 'system',
      mode: 'hero_image',
      category: 'image',
      name: 'System',
      body: 'System',
    },
    {
      id: 'personal',
      source: 'seller',
      mode: 'hero_image',
      category: 'image',
      name: 'Personal',
      body: 'Own',
    },
  ]);
  window.vnPochta = api;
  const view = render(<StudioPage seller="seller-a" />);
  await screen.findByText('Personal');
  expect((screen.getByLabelText('Prompt tạo ảnh') as HTMLSelectElement).value).toBe('personal');
  view.unmount();
  render(<StudioPage seller="seller-a" selectedPromptId="hero_image" />);
  await screen.findByText('System');
  expect((screen.getByLabelText('Prompt tạo ảnh') as HTMLSelectElement).value).toBe('hero_image');
});
test('remaining paid jobs can be canceled while first request is pending', async () => {
  const api = bridge();
  api.defaults = vi.fn(async () => ({}));
  api.credentials.status = vi.fn(async () => ({
    source: 'local',
    configured: true,
    canStore: true,
  }));
  const p = {
    name: 'Image',
    body: 'Image',
    category: 'image',
    mode: 'hero_image',
    tags: [],
    nameRu: '',
    description: '',
    group: '',
  };
  const snapshot = {
    master: p,
    image: p,
    audit: p,
    ids: ['hero_image'],
    versions: [1],
    values: {},
    finalPrompt: 'Final',
    aspectRatio: '3:4',
  };
  const list: any[] = [];
  const make = (id: string) => ({
    id,
    batchId: 'batch',
    state: 'queued',
    snapshot,
    originalAssetIds: ['asset1'],
    outputAssetIds: [],
    qualityReport: null,
    errorCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: '',
    reviewedAt: null,
  });
  let release: () => void = () => {};
  let calls = 0;
  api.studio.list = vi.fn(async () => structuredClone(list));
  api.studio.get = vi.fn(async (id: string) => structuredClone(list.find((j) => j.id === id)));
  api.studio.prepare = vi.fn(async () => [snapshot]);
  api.studio.create = vi.fn(async () => {
    list.push(make('one'), make('two'));
    return structuredClone(list);
  });
  api.studio.run = vi.fn(async (id: string) => {
    calls++;
    const job = list.find((j) => j.id === id);
    job.state = 'generating';
    if (id === 'one')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    job.state = 'audit_failed';
  });
  api.studio.cancelQueued = vi.fn(async () => {
    for (const j of list) if (j.state === 'queued') j.state = 'rejected';
  });
  window.vnPochta = api;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<StudioPage seller="seller-a" />);
  await screen.findByText('Ảnh chính sản phẩm');
  fireEvent.click(screen.getByLabelText('Chọn ảnh nguồn asset1'));
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước prompt' }));
  await screen.findByText('Final');
  fireEvent.click(screen.getByRole('button', { name: /Tạo ảnh ·/ }));
  await waitFor(() => expect(calls).toBe(1));
  const cancel = screen.getAllByRole('button', {
    name: 'Dừng các ảnh chưa gửi',
  })[0] as HTMLButtonElement;
  expect(cancel.disabled).toBe(false);
  fireEvent.click(cancel);
  await waitFor(() => expect(api.studio.cancelQueued).toHaveBeenCalled());
  release();
  await waitFor(() => expect(api.studio.get).toHaveBeenCalledWith('two'));
  expect(calls).toBe(1);
});
test('historical review exposes every original reference and the generated output', async () => {
  window.vnPochta = bridge();
  const job: any = {
    id: 'job',
    state: 'awaiting_review',
    snapshot: {
      image: { name: 'Image' },
      ids: [],
      versions: [],
      finalPrompt: 'Final',
      aspectRatio: '3:4',
    },
    originalAssetIds: ['original-one', 'original-two'],
    outputAssetIds: ['output'],
    qualityReport: { passed: [], errors: [], verdict: 'manual_review', repairPrompt: '' },
    createdAt: new Date().toISOString(),
    errorCode: null,
  };
  render(<JobResult job={job} busy={false} onAction={() => {}} />);
  expect(screen.getByRole('button', { name: 'Xem ảnh original-one' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Xem ảnh original-two' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Xem ảnh output' })).toBeTruthy();
});
