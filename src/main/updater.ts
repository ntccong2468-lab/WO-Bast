import { app, shell } from 'electron';
import { createWriteStream } from 'node:fs';
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
}

function responseLength(response: IncomingMessage): number | null {
  const header = response.headers['content-length'];
  if (typeof header !== 'string') return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function requestResponse(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'User-Agent': 'VN-Pochta-Updater/0.2' } }, resolve);
    request.once('error', reject);
  });
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
  private readonly manifest: UpdateManifest;
  private readonly listeners = new Set<ProgressListener>();
  private readonly currentVersion: string;
  private readonly updatesDir: string;
  private readonly openExternal: OpenExternal;
  private readonly quit: () => void;
  private info: UpdateInfo;
  private downloadPromise: Promise<UpdateInfo> | null = null;

  constructor(options: UpdaterOptions) {
    this.currentVersion = options.currentVersion;
    this.updatesDir = options.updatesDir;
    this.manifest = options.manifest ?? updateManifest;
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url).then(() => {}));
    this.quit = options.quit ?? (() => app.quit());
    this.info = this.makeInfo('idle');
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async check(): Promise<UpdateInfo> {
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
    const openError = await shell.openPath(this.info.localPath);
    if (openError) throw new Error(`Không thể mở bộ cài: ${openError}`);
    this.quit();
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
