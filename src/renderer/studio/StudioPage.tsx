import { useEffect, useRef, useState } from 'react';
import type { Prompt, SellerId } from '../../shared/contracts';
import type {
  Asset,
  CredentialStatus,
  CreateStudioRequest,
  PromptSnapshot,
  StudioJob,
} from '../../shared/studio-contracts';
import { variables, interpolate } from '../../shared/interpolation';
import { SourceImages } from './SourceImages';
import { StudioHistory } from './StudioHistory';
interface Props {
  seller: SellerId;
  selectedPromptId?: string;
  historyOnly?: boolean;
  onBusyChange?: (busy: boolean) => void;
}
export function StudioPage({ seller, selectedPromptId, historyOnly = false, onBusyChange }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [prompts, setPrompts] = useState<Prompt[]>([]),
    [defaults, setDefaults] = useState<Record<string, string>>({}),
    [ids, setIds] = useState<string[]>([]),
    [values, setValues] = useState<Record<string, string>>({}),
    [ratio, setRatio] = useState<'3:4' | '2:3'>('3:4'),
    [batch, setBatch] = useState(false),
    [preview, setPreview] = useState<PromptSnapshot[]>([]),
    [jobs, setJobs] = useState<StudioJob[]>([]),
    [credential, setCredential] = useState<CredentialStatus | null>(null),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState(''),
    [networkRunning, setNetworkRunning] = useState(false);
  const alive = useRef(true),
    locked = useRef(false),
    networkLock = useRef(false);
  const api = window.vnPochta;
  const reloadJobs = async () => {
    const result = await api.studio.list();
    if (alive.current) setJobs(result);
  };
  useEffect(() => {
    alive.current = true;
    onBusyChange?.(true);
    Promise.all([
      api.studio.assets(),
      api.list(),
      api.studio.list(),
      api.credentials.status(),
      api.defaults(),
    ])
      .then(([a, p, j, c, defs]) => {
        if (!alive.current) return;
        setAssets(a);
        const imagePrompts = p.filter((p) => p.category === 'image');
        setPrompts(imagePrompts);
        setDefaults(defs);
        const preferred =
          imagePrompts.find((p) => p.id === defs.hero_image) ??
          imagePrompts.find((p) => p.id === 'hero_image') ??
          imagePrompts[0];
        setIds(
          imagePrompts.some((p) => p.id === selectedPromptId)
            ? [selectedPromptId!]
            : preferred
              ? [preferred.id]
              : [],
        );
        setJobs(j);
        setCredential(c);
      })
      .catch(() => {
        if (alive.current) setMessage('Không thể tải AI Studio.');
      })
      .finally(() => {
        if (alive.current) {
          setBusy(false);
          onBusyChange?.(false);
        }
      });
    return () => {
      alive.current = false;
    };
  }, [seller]);
  useEffect(() => {
    setPreview([]);
  }, [selected.join('|'), ids.join('|'), JSON.stringify(values), ratio]);
  useEffect(() => {
    if (!jobs.some((j) => j.state === 'generating' || j.state === 'auditing') && !networkRunning)
      return;
    const timer = setInterval(() => {
      void reloadJobs().catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [jobs, networkRunning]);
  const work = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : 'Không thể thực hiện thao tác.');
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const request = (): CreateStudioRequest => ({
    assetIds: selected,
    promptIds: ids,
    values,
    aspectRatio: ratio,
  });
  const runJobs = async (items: StudioJob[]) => {
    if (networkLock.current) return;
    networkLock.current = true;
    setNetworkRunning(true);
    try {
      for (const job of items) {
        if (!alive.current) break;
        const latest = await api.studio.get(job.id);
        if (!alive.current) break;
        if (latest.state !== 'queued') continue;
        await api.studio.run(job.id);
        if (alive.current) await reloadJobs();
      }
    } catch (e) {
      if (alive.current) setMessage(e instanceof Error ? e.message : 'Không thể chạy tác vụ.');
    } finally {
      networkLock.current = false;
      if (alive.current) {
        setNetworkRunning(false);
        await reloadJobs();
      }
    }
  };
  const create = () => {
    if (!preview.length || !credential?.configured || networkLock.current) return;
    if (
      !window.confirm(
        `Gửi ${selected.length} ảnh nguồn đến OpenAI để tạo ${ids.length} tác vụ? Model gpt-image-1, ảnh native 1024×1536, xuất ${ratio}. Tạo và kiểm định ảnh có tính phí.`,
      )
    )
      return;
    void work(async () => {
      const created = await api.studio.create(request());
      if (!alive.current) return;
      setPreview([]);
      await reloadJobs();
      void runJobs(created);
    });
  };
  const action = (job: StudioJob, action: string) => {
    if (action === 'run') {
      if (!window.confirm('Gửi tác vụ này tới OpenAI? Có thể phát sinh phí.')) return;
      void runJobs([job]);
      return;
    }
    if (action === 'audit') {
      if (
        !window.confirm('Gửi lại ảnh gốc và kết quả tới OpenAI để kiểm định? Có thể phát sinh phí.')
      )
        return;
      void work(async () => {
        await api.studio.retryAudit(job.id);
        await reloadJobs();
      });
      return;
    }
    if (action === 'approve') {
      const manual = job.qualityReport?.verdict === 'manual_review';
      if (
        !window.confirm(
          manual
            ? 'Audit cần kiểm tra thủ công. Bạn đã đối chiếu ảnh gốc và xác nhận duyệt?'
            : 'Bạn đã đối chiếu ảnh gốc và xác nhận duyệt ảnh này?',
        )
      )
        return;
      void work(async () => {
        await api.studio.review(job.id, 'approve', manual);
        await reloadJobs();
      });
      return;
    }
    if (action === 'reject' && !window.confirm('Từ chối ảnh này?')) return;
    void work(async () => {
      if (action === 'reject') await api.studio.review(job.id, 'reject', false);
      else if (action === 'export') await api.studio.exportApproved(job.id);
      else if (action === 'cancel') await api.studio.cancelQueued(job.batchId);
      await reloadJobs();
    });
  };
  const batchPrompts = Array.from(
    new Map(
      prompts.map((p) => {
        const preferred =
          p.source === 'system' ? prompts.find((x) => x.id === defaults[p.mode]) : undefined;
        return [preferred?.id ?? p.id, preferred ?? p] as const;
      }),
    ).values(),
  );
  return (
    <div className="studio-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TỪ ẢNH THẬT ĐẾN NỘI DUNG ĐƯỢC DUYỆT</span>
          <h1>{historyOnly ? 'Lịch sử ảnh' : 'AI Studio'}</h1>
          <p className="muted">
            Seller {seller === 'seller-a' ? 'A' : 'B'} · Dữ liệu riêng trên máy này
          </p>
        </div>
        <span className="badge">
          {credential?.configured
            ? credential.source === 'environment'
              ? 'Khóa môi trường dùng chung'
              : 'Đã cấu hình khóa cá nhân'
            : 'Chưa cấu hình OpenAI'}
        </span>
      </div>
      {message && (
        <p role="alert" className="message error">
          {message}
        </p>
      )}
      {busy && <p role="status">Đang xử lý…</p>}
      {!historyOnly && (
        <>
          <SourceImages
            assets={assets}
            selected={selected}
            busy={busy}
            onImport={() =>
              void work(async () => {
                const imported = await api.studio.importImages();
                if (!alive.current) return;
                setAssets(await api.studio.assets());
                if (alive.current) setSelected(imported.slice(0, 6).map((a) => a.id));
              })
            }
            onToggle={(id) =>
              setSelected(
                selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
              )
            }
          />
          <section className="studio-panel">
            <h2>2. Prompt và nội dung cuối</h2>
            <label className="check">
              <input
                type="checkbox"
                disabled={busy}
                checked={batch}
                onChange={(e) => {
                  setBatch(e.target.checked);
                  setIds(ids.slice(0, 1));
                }}
              />
              Tạo bộ ảnh chuyên nghiệp
            </label>
            <fieldset disabled={busy}>
              {batch ? (
                <div className="prompt-options">
                  {batchPrompts.map((p) => (
                    <label key={p.id} className="check">
                      <input
                        type="checkbox"
                        checked={ids.includes(p.id)}
                        onChange={() =>
                          setIds(
                            ids.includes(p.id)
                              ? ids.filter((id) => id !== p.id)
                              : [...ids, p.id].slice(0, 7),
                          )
                        }
                      />
                      {p.name} · {p.source === 'seller' ? 'Của tôi' : 'Mặc định'}
                    </label>
                  ))}
                </div>
              ) : (
                <label>
                  Prompt tạo ảnh
                  <select
                    aria-label="Prompt tạo ảnh"
                    value={ids[0] ?? ''}
                    onChange={(e) => setIds([e.target.value])}
                  >
                    {prompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Tỷ lệ ảnh xuất
                <select
                  aria-label="Tỷ lệ ảnh xuất"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value as typeof ratio)}
                >
                  <option value="3:4">3:4 · thêm lề trắng, không cắt sản phẩm</option>
                  <option value="2:3">2:3 · native 1024×1536</option>
                </select>
              </label>
              <div className="variable-grid">
                {variables.map((key) => (
                  <label key={key}>
                    {key}
                    <input
                      value={values[key] ?? ''}
                      onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <p className="muted">
                Giữ nguyên sản phẩm và chỉ dùng đặc tính đã xác minh. Infographic ở bước này chỉ tạo
                nền; lớp chữ chỉnh sửa sẽ được bổ sung sau.
              </p>
              <div className="actions">
                <button
                  disabled={!selected.length || !ids.length}
                  onClick={() =>
                    void work(async () => {
                      const result = await api.studio.prepare(request());
                      if (alive.current) setPreview(result);
                    })
                  }
                >
                  Xem trước prompt
                </button>
                <button
                  className="primary"
                  disabled={!preview.length || !credential?.configured || networkRunning}
                  onClick={create}
                >
                  Tạo ảnh · {ids.length} tác vụ
                </button>
              </div>
            </fieldset>
            {!credential?.configured && (
              <p className="warning">
                Chưa có khóa API. Mở Cấu hình để nhập và kiểm tra khóa trước khi tạo ảnh.
              </p>
            )}
            {preview.map((p, i) => (
              <details key={i} open>
                <summary>{p.image?.name ?? 'Prompt'} · Nội dung cuối đã ghép</summary>
                <pre>{p.finalPrompt}</pre>
              </details>
            ))}
          </section>
        </>
      )}
      <StudioHistory
        jobs={jobs}
        busy={busy || networkRunning}
        cancelBusy={busy}
        onAction={action}
      />
    </div>
  );
}
