// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdateBanner } from '../../src/renderer/UpdateBanner';
import type { UpdateInfo } from '../../src/shared/update-contracts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function info(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    currentVersion: '0.2.0',
    latestVersion: '0.2.2',
    available: true,
    title: 'VN ПОЧТА 0.2.2',
    notes: [
      'Xóa trường kỹ thuật khỏi giao diện tạo ảnh.',
      'Bổ sung tỷ lệ 9:16 và tải ảnh không biến dạng.',
    ],
    releaseUrl: 'https://github.com/ntccong2468-lab/WO-Bast/releases/tag/v0.2.2',
    installerUrl:
      'https://github.com/ntccong2468-lab/WO-Bast/releases/download/v0.2.2/VN-Pochta-Setup-0.2.2-x64.exe',
    state: 'idle',
    downloadedBytes: 0,
    totalBytes: 10 * 1024 * 1024,
    localPath: null,
    error: null,
    ...overrides,
  };
}

function installBridge(initial: UpdateInfo) {
  let listener: ((next: UpdateInfo) => void) | undefined;
  const updates = {
    check: vi.fn(async () => initial),
    download: vi.fn(async () => {
      const next = info({ state: 'downloaded', downloadedBytes: 10 * 1024 * 1024 });
      listener?.(next);
      return next;
    }),
    install: vi.fn(async () => {}),
    openRelease: vi.fn(async () => {}),
    onProgress: vi.fn((next: (value: UpdateInfo) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  };
  window.vnPochta = { updates } as never;
  return updates;
}

test('shows new release notes and downloads with a progress state', async () => {
  const api = installBridge(info());
  render(<UpdateBanner />);

  expect(await screen.findByText('Có bản cập nhật mới: VN ПОЧТА 0.2.2')).toBeTruthy();
  expect(screen.getByText(/Xóa trường kỹ thuật/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Tải bản cập nhật' }));
  await waitFor(() => expect(api.download).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('button', { name: 'Cài đặt và khởi động lại' })).toBeTruthy();
});

test('shows download progress and does not render when no update exists', async () => {
  installBridge(info({ state: 'downloading', downloadedBytes: 4 * 1024 * 1024 }));
  render(<UpdateBanner />);
  expect(await screen.findByText(/4,0 MB \/ 10,0 MB/)).toBeTruthy();

  cleanup();
  installBridge(info({ available: false, latestVersion: '0.2.0', state: 'idle' }));
  render(<UpdateBanner />);
  await waitFor(() => expect(screen.queryByText(/Có bản cập nhật mới/)).toBeNull());
});
