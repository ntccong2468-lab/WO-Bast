import { useEffect, useRef, useState } from 'react';
import type { Asset } from '../../shared/studio-contracts';
export function AssetThumb({ id }: { id: string }) {
  const [src, setSrc] = useState(''),
    [large, setLarge] = useState(''),
    [error, setError] = useState('');
  const modal = useRef<HTMLDialogElement>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setSrc('');
    window.vnPochta.studio
      .thumbnail(id)
      .then((s) => {
        if (alive.current) setSrc(s);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [id]);
  return (
    <>
      <button
        className="image-button"
        aria-label={'Xem ảnh ' + id}
        onClick={async () => {
          setError('');
          modal.current?.showModal();
          try {
            const result = await window.vnPochta.studio.preview(id);
            if (alive.current) setLarge(result);
          } catch {
            if (alive.current) setError('Không thể mở ảnh.');
          }
        }}
      >
        {src ? <img src={src} alt="Ảnh sản phẩm" /> : <span className="muted">Đang tải ảnh…</span>}
      </button>
      <dialog ref={modal} className="image-dialog">
        <button onClick={() => modal.current?.close()}>Đóng ảnh</button>
        {error ? (
          <p>{error}</p>
        ) : large ? (
          <img src={large} alt="Ảnh xem chi tiết để đối chiếu sản phẩm" />
        ) : (
          <p>Đang mở ảnh…</p>
        )}
        <small>Ảnh xem tối đa 1600 px. Tệp gốc vẫn giữ nguyên.</small>
      </dialog>
    </>
  );
}
export function SourceImages({
  assets,
  selected,
  busy,
  onImport,
  onToggle,
}: {
  assets: Asset[];
  selected: string[];
  busy: boolean;
  onImport: () => void;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="studio-panel">
      <div className="editor-top">
        <div>
          <h2>1. Ảnh sản phẩm nguồn</h2>
          <p className="muted">Tối đa 6 ảnh · PNG, JPEG, WebP · 20 MiB/ảnh, tổng 60 MiB</p>
        </div>
        <button disabled={busy} onClick={onImport}>
          + Tải ảnh nguồn
        </button>
      </div>
      {!assets.length && <p className="empty">Chưa có ảnh nguồn. Chọn ảnh thật để bắt đầu.</p>}
      <div className="asset-grid">
        {assets.map((a) => (
          <div key={a.id} className={'asset-card ' + (selected.includes(a.id) ? 'selected' : '')}>
            <label>
              <input
                type="checkbox"
                disabled={busy || (!selected.includes(a.id) && selected.length >= 6)}
                aria-label={'Chọn ảnh nguồn ' + a.id}
                checked={selected.includes(a.id)}
                onChange={() => onToggle(a.id)}
              />
              <small>
                {a.width} × {a.height}
              </small>
            </label>
            <AssetThumb id={a.id} />
          </div>
        ))}
      </div>
    </section>
  );
}
