import { useEffect, useRef, useState } from 'react';
import type { Prompt, PromptInput, PromptVersion, SellerId } from '../shared/contracts';
import { PromptLibrary } from './PromptLibrary';
import { blank, toInput } from './PromptEditor';
export const pages = [
  'Tổng quan',
  'AI Studio',
  'Nội dung sản phẩm',
  'Kho Prompt',
  'Đăng sản phẩm',
  'Kiểm thử',
  'Lịch sử',
  'Cấu hình',
];
export function App() {
  const api = window.vnPochta;
  const [seller, setSeller] = useState<SellerId>('seller-a'),
    [page, setPage] = useState('Kho Prompt'),
    [collapsed, setCollapsed] = useState(false),
    [prompts, setPrompts] = useState<Prompt[]>([]),
    [prompt, setPrompt] = useState<Prompt | null>(null),
    [draft, setDraft] = useState<PromptInput>(blank),
    [base, setBase] = useState<PromptInput>(blank),
    [versions, setVersions] = useState<PromptVersion[]>([]),
    [defaults, setDefaults] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(true),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [studio, setStudio] = useState<Prompt | null>(null);
  const epoch = useRef(0);
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  const load = async (selected?: Prompt | null) => {
    const token = epoch.current;
    const [list, defs] = await Promise.all([api.list(), api.defaults()]);
    if (token !== epoch.current) return;
    setPrompts(list);
    setDefaults(defs);
    if (selected !== undefined) {
      const p = selected ? (list.find((p) => p.id === selected.id) ?? null) : null;
      setPrompt(p);
      const value = p ? toInput(p) : { ...blank, tags: [] };
      setDraft(value);
      setBase(value);
      const history = p ? await api.versions(p.id) : [];
      if (token === epoch.current) setVersions(history);
    }
  };
  useEffect(() => {
    const token = epoch.current;
    api
      .session()
      .then(async (s) => {
        if (token !== epoch.current) return;
        setSeller(s.seller);
        const list = await api.list();
        if (token === epoch.current) await load(list[0] ?? null);
      })
      .catch((e) => {
        if (token === epoch.current) setError(String(e));
      })
      .finally(() => {
        if (token === epoch.current) setBusy(false);
      });
    return () => {
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    void api.setDirty(dirty).catch(() => {});
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const leave = () => !dirty || window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi?');
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const select = (p: Prompt | null) => {
    if (!leave()) return;
    void run(async () => {
      await load(p);
    });
  };
  const switchSeller = (next: SellerId) => {
    if (!leave()) return;
    void run(async () => {
      epoch.current++;
      await api.switchSeller(next);
      setSeller(next);
      setPrompt(null);
      setVersions([]);
      setDraft(blank);
      setBase(blank);
      setPrompts([]);
      setStudio(null);
      const list = await api.list();
      await load(list[0] ?? null);
    });
  };
  const save = (copy = false) =>
    void run(async () => {
      const saved = copy || !prompt ? await api.create(draft) : await api.save(prompt.id, draft);
      await load(saved);
      await api.setDirty(false);
      setNotice('Đã lưu prompt.');
    });
  const action = (kind: string, arg?: number) => {
    if (!prompt) return;
    if (['clone', 'rename', 'delete', 'reset', 'restore'].includes(kind) && !leave()) return;
    if (
      ['delete', 'reset', 'restore'].includes(kind) &&
      !window.confirm(
        kind === 'delete'
          ? 'Xóa prompt cá nhân này?'
          : 'Khôi phục nội dung? Lịch sử hiện tại được giữ lại.',
      )
    )
      return;
    if (kind === 'rename') {
      document.getElementById('prompt-name')?.focus();
      return;
    }
    void run(async () => {
      switch (kind) {
        case 'favorite':
          await api.favorite(prompt.id, !prompt.isFavorite);
          setPrompt({ ...prompt, isFavorite: !prompt.isFavorite });
          await load();
          break;
        case 'clone':
          await load(await api.clone(prompt.id));
          break;
        case 'delete':
          await api.remove(prompt.id);
          await load(null);
          break;
        case 'reset':
          await load(await api.reset(prompt.id));
          break;
        case 'restore':
          await load(await api.restore(prompt.id, arg!));
          break;
        case 'default':
          await api.setDefault(draft.mode, prompt.id);
          await load();
          break;
        case 'export':
          if (!(await api.saveExport([prompt.id]))) return;
          break;
        case 'use':
          await api.markUsed(prompt.id);
          setStudio(prompt);
          setPage('AI Studio');
          await load(prompt);
          break;
      }
      setNotice('Đã hoàn tất thao tác.');
    });
  };
  return (
    <div className={'app ' + (collapsed ? 'collapsed' : '')}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">VN</span>
          <strong>ПОЧТА</strong>
        </div>
        <button
          className="collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Thu gọn điều hướng"
        >
          ☰
        </button>
        <span className="nav-label">KHÔNG GIAN LÀM VIỆC</span>
        <nav>
          {pages.map((name, i) => (
            <button
              key={name}
              title={name}
              aria-current={page === name ? 'page' : undefined}
              disabled={busy}
              onClick={() => {
                if (!leave()) return;
                setDraft(base);
                setPage(name);
              }}
            >
              <span className="nav-icon">{['◫', '✧', '▤', '▦', '↗', '✓', '◷', '⚙'][i]}</span>
              <span className="nav-text">{name}</span>
              {page === name && <span className="nav-dot">●</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{seller === 'seller-a' ? 'A' : 'B'}</span>
          <div>
            <strong>Seller local {seller === 'seller-a' ? 'A' : 'B'}</strong>
            <small>Không gian cá nhân</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Không gian làm việc <span>/</span> <strong>{page}</strong>
          </span>
          <div className="header-actions">
            <span className="api-status">
              <i />
              OpenAI · Chưa kết nối
            </span>
            <label>
              Seller hiện hành
              <select
                value={seller}
                disabled={busy}
                onChange={(e) => switchSeller(e.target.value as SellerId)}
              >
                <option value="seller-a">Seller local A</option>
                <option value="seller-b">Seller local B</option>
              </select>
            </label>
            <button aria-label="Thông báo" onClick={() => setNotice('Chưa có thông báo mới.')}>
              ♧
            </button>
          </div>
        </header>
        <main aria-busy={busy}>
          {error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              {notice}
            </div>
          )}
          {busy && (
            <div role="status" className="working">
              Đang xử lý…
            </div>
          )}
          {page === 'Kho Prompt' ? (
            <PromptLibrary
              key={seller}
              prompts={prompts}
              prompt={prompt}
              draft={draft}
              dirty={dirty}
              busy={busy}
              versions={versions}
              defaults={defaults}
              onChange={setDraft}
              onSave={save}
              onAction={action}
              onSelect={select}
              onNew={() => select(null)}
              onImport={(file) => {
                if (!leave()) return;
                void run(async () => {
                  const token = epoch.current;
                  if (file.size > 2 * 1024 * 1024) throw new Error('JSON tối đa 2 MiB');
                  let json: string;
                  try {
                    json = await file.text();
                  } catch {
                    throw new Error('Không thể đọc tệp JSON');
                  }
                  if (token !== epoch.current) return;
                  const imported = await api.importJson(json);
                  await load(imported[0]);
                  setNotice(`Đã nhập ${imported.length} prompt cá nhân.`);
                });
              }}
            />
          ) : (
            <section className="integration-page">
              <span className="eyebrow">VN ПОЧТА</span>
              <h1>{page}</h1>
              {page === 'Tổng quan' ? (
                <>
                  <p>Không gian quản lý nội dung sản phẩm cho marketplace Nga.</p>
                  <div className="stat">
                    <strong>{prompts.length}</strong>
                    <span>Prompt khả dụng cho seller hiện hành</span>
                  </div>
                  <button className="primary" onClick={() => setPage('Kho Prompt')}>
                    Mở Kho Prompt
                  </button>
                </>
              ) : (
                <>
                  <p className="notice">Chưa kết nối · Chức năng này thuộc giai đoạn tiếp theo.</p>
                  {page === 'AI Studio' && studio && (
                    <>
                      <h2>Prompt đã chọn: {studio.name}</h2>
                      <pre>{studio.body}</pre>
                    </>
                  )}
                  <p>Chưa gửi ảnh, gọi API tạo ảnh hoặc đăng sản phẩm thật.</p>
                  {page === 'Kiểm thử' && (
                    <p>Kiểm thử dữ liệu sẽ tách riêng khỏi thao tác đăng thật.</p>
                  )}
                  <button disabled>
                    {page === 'Đăng sản phẩm' ? 'Đăng thật · Chưa khả dụng' : 'Chưa khả dụng'}
                  </button>
                </>
              )}
            </section>
          )}
        </main>
        <footer>
          VN ПОЧТА <span>Workspace / {seller} · Dữ liệu lưu trên máy này</span>
        </footer>
      </div>
    </div>
  );
}
