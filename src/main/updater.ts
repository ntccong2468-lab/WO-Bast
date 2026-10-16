import { app, shell } from 'electron';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { finished } from 'node:stream/promises';
import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { compareVersions, formatUpdateBytes, isAllowedUpdateUrl } from '../shared/update';
import { updateManifest, type UpdateInfo, type UpdateManifest } from '../shared/update-contracts';

export { compareVersions, formatUpdateBytes, isAllowedUpdateUrl };

type ProgressListener = (info: UpdateInfo) => void;
type OpenExternal = (url: string) => Promise<void>;

interface DownloadResult {
  path: string;
  downloadedBytes: number;
  totalBytes: number | null;
}

interface UpdaterOptions {
  currentVersion: string;
  updatesDir: string;
  manifest?: UpdateManifest;
  openExternal?: OpenExternal;
  quit?: () => void;
  quitDelayMs?: number;
}

const RELEASE_API_URL = 'https://api.github.com/repos/ntccong2468-lab/WO-Bast/releases/latest';

function responseLength(response: IncomingMessage): number | null {
  const header = response.headers['content-length'];
  if (typeof header !== 'string') return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function requestResponse(url: string, timeoutMs = 8000): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'User-Agent': 'VN-Pochta-Updater/0.2' } }, resolve);
    request.once('error', reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Hết thời gian kết nối máy chủ cập nhật.'));
    });
  });
}

async function readRelease(): Promise<UpdateManifest | null> {
  const response = await requestResponse(RELEASE_API_URL);
  if ((response.statusCode ?? 0) !== 200) {
    response.resume();
    return null;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.from(chunk));
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const release = value as {
    tag_name?: unknown;
    name?: unknown;
    html_url?: unknown;
    body?: unknown;
    assets?: unknown;
    draft?: unknown;
    prerelease?: unknown;
  };
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string') return null;
  const version = release.tag_name.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const installer = assets.find(
    (asset): asset is { name: string; browser_download_url: string } =>
      !!asset &&
      typeof asset === 'object' &&
      typeof (asset as { name?: unknown }).name === 'string' &&
      (asset as { name: string }).name === `VN-Pochta-Setup-${version}-x64.exe` &&
      typeof (asset as { browser_download_url?: unknown }).browser_download_url === 'string',
  );
  if (!installer || typeof release.html_url !== 'string') return null;
  return {
    version,
    title:
      typeof release.name === 'string' && release.name.trim()
        ? release.name
        : `VN ПОЧТА ${version}`,
    notes:
      typeof release.body === 'string' && release.body.trim()
        ? release.body
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 8)
        : [...updateManifest.notes],
    releaseUrl: release.html_url,
    installerUrl: installer.browser_download_url,
    installerName: installer.name,
  };
}

async function downloadFile(
  url: string,
  target: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void,
  redirects = 0,
): Promise<DownloadResult> {
  if (!isAllowedUpdateUrl(url)) throw new Error('Nguồn tải bản cập nhật không được phép.');
  if (redirects > 3) throw new Error('Nguồn tải bản cập nhật chuyển hướng quá nhiều lần.');
  await mkdir(dirname(target), { recursive: true });
  let response = await requestResponse(url);
  while ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
    const location = response.headers.location;
    response.resume();
    if (!location) throw new Error('Nguồn tải bản cập nhật thiếu địa chỉ chuyển hướng.');
    const nextUrl = new URL(location, url).toString();
    if (!isAllowedUpdateUrl(nextUrl))
      throw new Error('Nguồn tải bản cập nhật chuyển hướng đến miền không được phép.');
    if (redirects >= 3) throw new Error('Nguồn tải bản cập nhật chuyển hướng quá nhiều lần.');
    redirects++;
    response = await requestResponse(nextUrl);
  }
  if ((response.statusCode ?? 0) !== 200) {
    response.resume();
    throw new Error(`Không thể tải bản cập nhật (HTTP ${response.statusCode ?? 0}).`);
  }
  const totalBytes = responseLength(response);
  let downloadedBytes = 0;
  const output = createWriteStream(target);
  response.on('data', (chunk: Buffer) => {
    downloadedBytes += chunk.length;
    onProgress(downloadedBytes, totalBytes);
  });
  response.pipe(output);
  try {
    await finished(output);
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
  return { path: target, downloadedBytes, totalBytes };
}

export class Updater {
  private readonly listeners = new Set<ProgressListener>();
  private readonly currentVersion: string;
  private readonly updatesDir: string;
  private readonly openExternal: OpenExternal;
  private readonly quit: () => void;
  private readonly quitDelayMs: number;
  private manifest: UpdateManifest;
  private info: UpdateInfo;
  private downloadPromise: Promise<UpdateInfo> | null = null;

  constructor(options: UpdaterOptions) {
    this.currentVersion = options.currentVersion;
    this.updatesDir = options.updatesDir;
    this.manifest = options.manifest ?? updateManifest;
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url).then(() => {}));
    this.quit = options.quit ?? (() => app.quit());
    this.quitDelayMs = options.quitDelayMs ?? 1200;
    this.info = this.makeInfo('idle');
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async check(): Promise<UpdateInfo> {
    try {
      const remote = await readRelease();
      if (remote) this.manifest = remote;
    } catch {
      // The embedded manifest keeps the update center useful when GitHub is unavailable.
    }
    const available = compareVersions(this.manifest.version, this.currentVersion) > 0;
    this.info = this.makeInfo(available ? 'available' : 'idle', available);
    return this.info;
  }

  async download(): Promise<UpdateInfo> {
    if (this.downloadPromise) return this.downloadPromise;
    this.downloadPromise = this.downloadInternal().finally(() => {
      this.downloadPromise = null;
    });
    return this.downloadPromise;
  }

  async install(): Promise<void> {
    if (!this.info.localPath || this.info.state !== 'downloaded')
      throw new Error('Hãy tải bản cập nhật trước khi cài đặt.');
    try {
      await stat(this.info.localPath);
    } catch {
      throw new Error('Không tìm thấy tệp cập nhật đã tải. Hãy tải lại.');
    }
    if (process.platform === 'win32') {
      const installer = spawn(this.info.localPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      installer.unref();
      setTimeout(() => this.quit(), this.quitDelayMs);
      return;
    }
    const openError = await shell.openPath(this.info.localPath);
    if (openError) throw new Error(`Không thể mở bộ cài: ${openError}`);
    setTimeout(() => this.quit(), this.quitDelayMs);
  }

  async openRelease(): Promise<void> {
    if (!isAllowedUpdateUrl(this.manifest.releaseUrl))
      throw new Error('Liên kết phát hành không được phép.');
    await this.openExternal(this.manifest.releaseUrl);
  }

  private async downloadInternal(): Promise<UpdateInfo> {
    const available = compareVersions(this.manifest.version, this.currentVersion) > 0;
    if (!available) return this.info;
    const target = join(this.updatesDir, this.manifest.installerName);
    this.info = this.makeInfo('downloading', true, 0, null, null);
    this.emit();
    try {
      const result = await downloadFile(this.manifest.installerUrl, target, (downloaded, total) => {
        this.info = this.makeInfo('downloading', true, downloaded, total, null);
        this.emit();
      });
      this.info = this.makeInfo(
        'downloaded',
        true,
        result.downloadedBytes,
        result.totalBytes,
        result.path,
      );
      this.emit();
      return this.info;
    } catch (error) {
      this.info = this.makeInfo(
        'error',
        true,
        this.info.downloadedBytes,
        this.info.totalBytes,
        null,
        error instanceof Error ? error.message : 'Không thể tải bản cập nhật.',
      );
      this.emit();
      throw error;
    }
  }

  private makeInfo(
    state: UpdateInfo['state'],
    available = compareVersions(this.manifest.version, this.currentVersion) > 0,
    downloadedBytes = 0,
    totalBytes: number | null = null,
    localPath: string | null = null,
    error: string | null = null,
  ): UpdateInfo {
    return {
      currentVersion: this.currentVersion,
      latestVersion: this.manifest.version,
      available,
      title: this.manifest.title,
      notes: [...this.manifest.notes],
      releaseUrl: this.manifest.releaseUrl,
      installerUrl: this.manifest.installerUrl,
      state,
      downloadedBytes,
      totalBytes,
      localPath,
      error,
    };
  }

  private emit() {
    for (const listener of this.listeners) listener(this.info);
  }
}
