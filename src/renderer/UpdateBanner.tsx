import { useEffect, useState } from 'react';
import { formatUpdateBytes } from '../shared/update';
import type { UpdateInfo } from '../shared/update-contracts';

export function UpdateBanner() {
  const candidate = typeof window === 'undefined' ? undefined : window.vnPochta?.updates;
  const bridge =
    candidate && typeof candidate === 'object' && typeof candidate.check === 'function'
      ? candidate
      : undefined;
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checkError, setCheckError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const unsubscribe = bridge.onProgress((next) => {
      if (active) setInfo(next);
    });
    void bridge
      .check()
      .then((next) => {
        if (active) setInfo(next);
      })
      .catch((error) => {
        if (active)
          setCheckError(
            error instanceof Error ? error.message : 'Không thể kiểm tra bản cập nhật.',
          );
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  if (!bridge || !info || (!info.available && info.state !== 'error')) return null;
  const percent =
    info.totalBytes && info.totalBytes > 0
      ? Math.min(100, Math.round((info.downloadedBytes / info.totalBytes) * 100))
      : null;
  const run = async (action: () => Promise<UpdateInfo | void>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const next = await action();
      if (next) setInfo(next);
    } catch (error) {
      setInfo((previous) =>
        previous
          ? {
              ...previous,
              state: 'error',
              error: error instanceof Error ? error.message : 'Thao tác cập nhật thất bại.',
            }
          : previous,
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <section className="update-card" role="status" aria-label="Bản cập nhật ứng dụng">
      <div className="update-card-heading">
        <div>
          <span className="eyebrow">CẬP NHẬT ỨNG DỤNG</span>
          <h2>Có bản cập nhật mới: {info.title}</h2>
        </div>
        <span className="update-version">v{info.latestVersion}</span>
      </div>
      <p className="update-intro">
        Tải bản cập nhật để nhận các thay đổi mới nhất. Dữ liệu seller trên máy này được giữ nguyên.
      </p>
      <ul className="update-notes">
        {info.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {checkError && <p className="message error">{checkError}</p>}
      {info.state === 'downloading' && (
        <div className="update-progress" aria-label="Tiến trình tải bản cập nhật">
          <progress
            max={info.totalBytes ?? undefined}
            value={info.totalBytes ? info.downloadedBytes : undefined}
          />
          <span>
            {formatUpdateBytes(info.downloadedBytes, info.totalBytes)}
            {percent === null ? '' : ` · ${percent}%`}
          </span>
        </div>
      )}
      {info.state === 'downloaded' && (
        <p className="message success">
          Đã tải xong bộ cài. Khởi động lại để áp dụng bản cập nhật.
        </p>
      )}
      {info.state === 'error' && info.error && <p className="message error">{info.error}</p>}
      <div className="update-actions">
        {info.state === 'downloaded' ? (
          <button
            className="primary"
            disabled={actionBusy}
            onClick={() => void run(() => bridge.install())}
          >
            Cài đặt và khởi động lại
          </button>
        ) : (
          <button
            className="primary"
            disabled={actionBusy || info.state === 'downloading'}
            onClick={() => void run(() => bridge.download())}
          >
            {info.state === 'error' ? 'Tải lại bản cập nhật' : 'Tải bản cập nhật'}
          </button>
        )}
        <button disabled={actionBusy} onClick={() => void run(() => bridge.openRelease())}>
          Xem chi tiết phát hành
        </button>
      </div>
    </section>
  );
}
