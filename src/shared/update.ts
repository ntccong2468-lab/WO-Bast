const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const ALLOWED_UPDATE_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'release-assets.githubusercontent.com',
]);

export function compareVersions(left: string, right: string): number {
  const a = left.match(VERSION_PATTERN);
  const b = right.match(VERSION_PATTERN);
  if (!a || !b) throw new Error('Phiên bản ứng dụng không hợp lệ.');
  for (let i = 1; i <= 3; i++) {
    const difference = Number(a[i]) - Number(b[i]);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isAllowedUpdateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_UPDATE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function formatUpdateBytes(downloaded: number, total: number | null): string {
  const format = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
  };
  return total === null
    ? `Đã tải ${format(downloaded)}`
    : `${format(downloaded)} / ${format(total)}`;
}
