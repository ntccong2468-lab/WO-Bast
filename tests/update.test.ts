import { describe, expect, test } from 'vitest';
import { compareVersions, isAllowedUpdateUrl, formatUpdateBytes } from '../src/shared/update';

describe('update helpers', () => {
  test('compares semantic app versions', () => {
    expect(compareVersions('0.2.1', '0.2.0')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.1.9', '0.2.0')).toBeLessThan(0);
  });

  test('only permits HTTPS GitHub release URLs', () => {
    expect(
      isAllowedUpdateUrl('https://github.com/ntccong2468-lab/WO-Bast/releases/tag/v0.2.1'),
    ).toBe(true);
    expect(
      isAllowedUpdateUrl(
        'https://release-assets.githubusercontent.com/github-production-release-asset/example',
      ),
    ).toBe(true);
    expect(
      isAllowedUpdateUrl('http://github.com/ntccong2468-lab/WO-Bast/releases/tag/v0.2.1'),
    ).toBe(false);
    expect(isAllowedUpdateUrl('https://example.com/VN-Pochta-Setup.exe')).toBe(false);
  });

  test('formats download progress for Vietnamese UI', () => {
    expect(formatUpdateBytes(1024 * 1024, 2 * 1024 * 1024)).toBe('1,0 MB / 2,0 MB');
    expect(formatUpdateBytes(0, null)).toBe('Đã tải 0 B');
  });
});
