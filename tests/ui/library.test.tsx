// @vitest-environment jsdom
import React from 'react';
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { openDatabase } from '../../src/main/db';
import { seed } from '../../src/main/seed';
import bundle from '../../resources/default-prompts.json';
import { PromptService } from '../../src/main/prompt-service';
import { Session } from '../../src/main/session';
import { dispatch } from '../../src/main/ipc';
import type { Bridge } from '../../src/shared/contracts';
import { App } from '../../src/renderer/App';
let db: ReturnType<typeof openDatabase>;
let session: Session;
beforeEach(() => {
  db = openDatabase(':memory:');
  seed(db, bundle);
  session = new Session();
  const ctx = { db, service: new PromptService(db), session };
  window.vnPochta = new Proxy(
    {},
    {
      get: (target, method: string) =>
        Reflect.get(target, method) ??
        ((...args: unknown[]) => Promise.resolve().then(() => dispatch(ctx, true, method, args))),
    },
  ) as Bridge;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  db.close();
  vi.restoreAllMocks();
});
test('search Vietnamese without accents, Russian, English body; empty result', async () => {
  render(<App />);
  await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ });
  const search = screen.getByLabelText('Tìm prompt');
  fireEvent.change(search, { target: { value: 'anh can canh' } });
  await screen.findByRole('button', { name: /Ảnh cận cảnh chi tiết/ });
  expect(screen.queryByRole('button', { name: /Ảnh chính sản phẩm/ })).toBeNull();
  fireEvent.change(search, { target: { value: 'Главное' } });
  expect(screen.getByRole('button', { name: /Ảnh chính sản phẩm/ })).toBeTruthy();
  fireEvent.change(search, { target: { value: 'nonexistentzzz' } });
  expect(screen.getByText('Không tìm thấy prompt.')).toBeTruthy();
});
test('edit system into personal copy, preserve text and switch seller isolation', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ }));
  const body = await screen.findByLabelText('Nội dung prompt');
  fireEvent.change(body, { target: { value: '<b>Áo {{product_name}}</b>' } });
  expect(screen.queryByRole('strong', { name: 'Áo' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  await screen.findByText('Đã lưu prompt.');
  expect(session.dirty).toBe(false);
  fireEvent.change(screen.getByLabelText('Seller hiện hành'), { target: { value: 'seller-b' } });
  await waitFor(() => expect(session.seller).toBe('seller-b'));
  await waitFor(() =>
    expect((screen.getByLabelText('Nội dung prompt') as HTMLTextAreaElement).value).not.toContain(
      '<b>Áo',
    ),
  );
});
test('canceling unsaved navigation retains editor; save errors retain draft', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Lưu' }).hasAttribute('disabled')).toBe(false),
  );
  fireEvent.change(screen.getByLabelText('Nội dung prompt'), { target: { value: 'Draft' } });
  vi.mocked(window.confirm).mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: /Ảnh cận cảnh chi tiết/ }));
  expect((screen.getByLabelText('Nội dung prompt') as HTMLTextAreaElement).value).toBe('Draft');
  window.vnPochta.save = async () => {
    throw new Error('Disk full');
  };
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  await screen.findByText('Disk full');
  expect((screen.getByLabelText('Nội dung prompt') as HTMLTextAreaElement).value).toBe('Draft');
});
test('favorite toggling does not discard an unsaved draft', async () => {
  render(<App />);
  await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ });
  await waitFor(() =>
    expect((screen.getByLabelText('Nội dung prompt') as HTMLTextAreaElement).value).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText('Nội dung prompt'), {
    target: { value: 'Unsaved favorite draft' },
  });
  fireEvent.click(screen.getByLabelText('Yêu thích prompt'));
  await waitFor(() =>
    expect(screen.getByLabelText('Yêu thích prompt').getAttribute('aria-pressed')).toBe('true'),
  );
  expect((screen.getByLabelText('Nội dung prompt') as HTMLTextAreaElement).value).toBe(
    'Unsaved favorite draft',
  );
});
test('startup locks editing until ready, then seller B sees no seller A data', async () => {
  const originalList = window.vnPochta.list;
  let release: (value: Awaited<ReturnType<typeof originalList>>) => void = () => {};
  let started = false;
  let captured: Awaited<ReturnType<typeof originalList>> = [];
  const service = new PromptService(db);
  service.create('seller-a', {
    name: 'A private title',
    nameRu: '',
    description: '',
    category: 'image',
    body: 'A private body',
    tags: [],
    group: '',
    mode: 'hero',
  });
  window.vnPochta.list = async () => {
    if (!started) {
      started = true;
      captured = await originalList();
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return originalList();
  };
  render(<App />);
  await waitFor(() => expect(started).toBe(true));
  expect(
    (screen.getByLabelText('Nội dung prompt').closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  expect((screen.getByLabelText('Seller hiện hành') as HTMLSelectElement).disabled).toBe(true);
  release(captured);
  await waitFor(() =>
    expect((screen.getByLabelText('Seller hiện hành') as HTMLSelectElement).disabled).toBe(false),
  );
  fireEvent.change(screen.getByLabelText('Seller hiện hành'), { target: { value: 'seller-b' } });
  await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ });
  await waitFor(() => expect(session.seller).toBe('seller-b'));
  expect(screen.queryByText('A private title')).toBeNull();
});
test('category, source and favorite filters compose', async () => {
  render(<App />);
  await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ });
  fireEvent.change(screen.getByLabelText('Danh mục lọc'), { target: { value: 'quality' } });
  expect(screen.getByRole('button', { name: /Kiểm tra chất lượng ảnh AI/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Ảnh chính sản phẩm/ })).toBeNull();
  fireEvent.change(screen.getByLabelText('Nguồn'), { target: { value: 'seller' } });
  expect(screen.getByText('Không tìm thấy prompt.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Nguồn'), { target: { value: 'system' } });
  fireEvent.click(screen.getByLabelText('Yêu thích'));
  expect(screen.getByText('Không tìm thấy prompt.')).toBeTruthy();
});

test('pending JSON reads lock seller and editor so imports stay with their initiating seller', async () => {
  render(<App />);
  await screen.findByRole('button', { name: /Ảnh chính sản phẩm/ });
  await waitFor(() => expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('false'));
  let release: (value: string) => void = () => {};
  const file = new File(['placeholder'], 'prompts.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  });
  fireEvent.change(screen.getByLabelText('Tệp JSON'), { target: { files: [file] } });
  await waitFor(() =>
    expect((screen.getByLabelText('Seller hiện hành') as HTMLSelectElement).disabled).toBe(true),
  );
  expect(
    (screen.getByLabelText('Nội dung prompt').closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Seller hiện hành'), { target: { value: 'seller-b' } });
  release(JSON.stringify(bundle));
  await screen.findByText('Đã nhập 9 prompt cá nhân.');
  const service = new PromptService(db);
  expect(session.seller).toBe('seller-a');
  expect(service.list('seller-a')).toHaveLength(18);
  expect(service.list('seller-b')).toHaveLength(9);
});
