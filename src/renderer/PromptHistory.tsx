import type { PromptVersion } from '../shared/contracts';
export function PromptHistory({
  versions,
  busy,
  onRestore,
}: {
  versions: PromptVersion[];
  busy: boolean;
  onRestore: (v: number) => void;
}) {
  return (
    <section className="history">
      <h3>Lịch sử phiên bản</h3>
      {!versions.length ? (
        <p className="muted">Bản hệ thống chưa có lịch sử chỉnh sửa cá nhân.</p>
      ) : (
        versions.map((v) => (
          <details key={v.version}>
            <summary>
              v{v.version} · {new Date(v.createdAt).toLocaleString('vi-VN')} · {v.editedBy}
            </summary>
            <p>{v.snapshot.name}</p>
            <pre>{v.snapshot.body}</pre>
            <button disabled={busy} onClick={() => onRestore(v.version)}>
              Khôi phục v{v.version}
            </button>
          </details>
        ))
      )}
    </section>
  );
}
