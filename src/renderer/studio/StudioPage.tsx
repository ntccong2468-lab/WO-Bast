import { useEffect, useRef, useState } from 'react';
import type { Prompt, SellerId } from '../../shared/contracts';
import type {
  Asset,
  CredentialStatus,
  CreateStudioRequest,
  ImageAnalysis,
  PromptSnapshot,
  StudioJob,
} from '../../shared/studio-contracts';
import { aspectRatios } from '../../shared/studio-contracts';
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
    [ratio, setRatio] = useState<import('../../shared/studio-contracts').AspectRatioId>('3:4'),
    [taskRatios, setTaskRatios] = useState<
      Record<string, import('../../shared/studio-contracts').AspectRatioId>
    >({}),
    [applyRatioToAll, setApplyRatioToAll] = useState(true),
    [productSize, setProductSize] = useState(''),
    [analysis, setAnalysis] = useState<ImageAnalysis | null>(null),
    [analysisBusy, setAnalysisBusy] = useState(false),
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
      api.studio.productProfile?.() ?? Promise.resolve({ productSize: '' }),
    ])
      .then(([a, p, j, c, defs, profile]) => {
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
        setProductSize(profile?.productSize ?? '');
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
  }, [
    selected.join('|'),
    ids.join('|'),
    JSON.stringify(values),
    ratio,
    JSON.stringify(taskRatios),
    productSize,
    JSON.stringify(analysis),
  ]);
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
    productSize,
    aspectRatio: ratio,
    aspectRatios: applyRatioToAll ? undefined : taskRatios,
    analysis: analysis ?? undefined,
  });
  const analyzeSelected = async (assetIds: string[]) => {
    if (!assetIds.length || !api.studio.analyze || !credential?.configured) return;
    setAnalysisBusy(true);
    try {
      const result = await api.studio.analyze(assetIds);
      if (alive.current) setAnalysis(result);
    } catch (e) {
      if (alive.current) setMessage(e instanceof Error ? e.message : 'Không thể phân tích ảnh.');
    } finally {
      if (alive.current) setAnalysisBusy(false);
    }
  };
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
      await api.studio.saveProductSize?.(productSize);
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
            busy={busy || analysisBusy}
            onImport={() =>
              void work(async () => {
                const imported = await api.studio.importImages();
                if (!alive.current) return;
                setAssets(await api.studio.assets());
                const importedIds = imported.slice(0, 6).map((a) => a.id);
                if (alive.current) {
                  setSelected(importedIds);
                  setAnalysis(null);
                }
                await analyzeSelected(importedIds);
              })
            }
            onToggle={(id) => {
              const next = selected.includes(id)
                ? selected.filter((x) => x !== id)
                : [...selected, id];
              setSelected(next);
              setAnalysis(null);
              void analyzeSelected(next);
            }}
          />
          <section className="studio-panel">
            <h2>2. Cấu hình tạo ảnh và nội dung</h2>
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
                Tỷ lệ ảnh áp dụng chung
                <select
                  aria-label="Tỷ lệ ảnh áp dụng chung"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value as typeof ratio)}
                >
                  {aspectRatios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} · {item.name} · {item.pixels} · {item.use}
                    </option>
                  ))}
                </select>
              </label>
              {batch && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={applyRatioToAll}
                    onChange={(e) => setApplyRatioToAll(e.target.checked)}
                  />
                  Áp dụng tỷ lệ này cho toàn bộ tác vụ
                </label>
              )}
              {batch && !applyRatioToAll && (
                <div className="prompt-options">
                  {ids.map((id) => {
                    const prompt = prompts.find((item) => item.id === id);
                    return (
                      <label key={id}>
                        Tỷ lệ riêng cho {prompt?.name ?? 'tác vụ'}
                        <select
                          aria-label={`Tỷ lệ riêng cho ${prompt?.name ?? id}`}
                          value={taskRatios[id] ?? ratio}
                          onChange={(e) =>
                            setTaskRatios({ ...taskRatios, [id]: e.target.value as typeof ratio })
                          }
                        >
                          {aspectRatios.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} · {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
              <label>
                Kích thước sản phẩm (Size)
                <input
                  aria-label="Kích thước sản phẩm (Size)"
                  placeholder="Ví dụ: 48-56; 58-66"
                  maxLength={200}
                  value={productSize}
                  onChange={(e) => setProductSize(e.target.value)}
                />
              </label>
              {analysis && (
                <section className="analysis-card" aria-label="Phân tích ảnh gốc">
                  <h3>Phân tích ảnh gốc và đề xuất tiếng Nga</h3>
                  <p>
                    <strong>Sản phẩm:</strong> {analysis.productNameRu} · <strong>Loại:</strong>{' '}
                    {analysis.productTypeRu}
                  </p>
                  <p>
                    <strong>Mô tả tiếng Nga:</strong> {analysis.descriptionRu}
                  </p>
                  <p>
                    <strong>Màu quan sát được:</strong>{' '}
                    {analysis.colorsRu.join(', ') || 'Chưa xác định'}
                  </p>
                  <p>
                    <strong>Đặc tính quan sát được:</strong>{' '}
                    {analysis.observedAttributesRu.join('; ') || 'Chưa có'}
                  </p>
                  <p className="warning">
                    <strong>Chưa xác minh:</strong>{' '}
                    {analysis.uncertainAttributesRu.join('; ') || 'Không có đề xuất chưa xác minh'}
                  </p>
                  <h4>Chữ trên từng ảnh — seller bật, sửa và duyệt trước khi xuất</h4>
                  {analysis.textProposals.map((proposal, index) => (
                    <div
                      className="text-proposal"
                      key={`${proposal.assetIndex}-${proposal.role}-${index}`}
                    >
                      <strong>
                        Ảnh {proposal.assetIndex + 1} ·{' '}
                        {proposal.role === 'hero'
                          ? 'Ảnh chính'
                          : proposal.role === 'infographic'
                            ? 'Infographic'
                            : proposal.role === 'advertising'
                              ? 'Quảng cáo'
                              : 'Chi tiết'}
                      </strong>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={proposal.enabled}
                          onChange={(e) =>
                            setAnalysis({
                              ...analysis,
                              textProposals: analysis.textProposals.map((item, i) =>
                                i === index ? { ...item, enabled: e.target.checked } : item,
                              ),
                            })
                          }
                        />{' '}
                        Bật chữ
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={proposal.approved}
                          onChange={(e) =>
                            setAnalysis({
                              ...analysis,
                              textProposals: analysis.textProposals.map((item, i) =>
                                i === index ? { ...item, approved: e.target.checked } : item,
                              ),
                            })
                          }
                        />{' '}
                        Đã duyệt nội dung
                      </label>
                      <input
                        aria-label={`Tiêu đề tiếng Nga ảnh ${proposal.assetIndex + 1}`}
                        value={proposal.titleRu}
                        onChange={(e) =>
                          setAnalysis({
                            ...analysis,
                            textProposals: analysis.textProposals.map((item, i) =>
                              i === index ? { ...item, titleRu: e.target.value } : item,
                            ),
                          })
                        }
                      />
                      <textarea
                        aria-label={`Mô tả tiếng Nga ảnh ${proposal.assetIndex + 1}`}
                        value={proposal.bodyRu}
                        onChange={(e) =>
                          setAnalysis({
                            ...analysis,
                            textProposals: analysis.textProposals.map((item, i) =>
                              i === index ? { ...item, bodyRu: e.target.value } : item,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </section>
              )}
              <div className="actions">
                <button
                  type="button"
                  disabled={busy || analysisBusy || !selected.length || !api.studio.analyze}
                  onClick={() => void analyzeSelected(selected)}
                >
                  {analysisBusy ? 'Đang phân tích ảnh…' : 'Phân tích lại ảnh gốc'}
                </button>
              </div>
              <p className="muted">
                Hệ thống chỉ đưa đặc tính quan sát được vào prompt. Đặc tính chưa xác minh không
                được tự thêm vào nội dung bán hàng.
              </p>
              <div className="actions">
                <button
                  disabled={!selected.length || !ids.length}
                  onClick={() =>
                    void work(async () => {
                      await api.studio.saveProductSize?.(productSize);
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
