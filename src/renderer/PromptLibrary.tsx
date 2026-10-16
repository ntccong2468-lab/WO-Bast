import { useState, useRef } from 'react';
import type { Prompt } from '../shared/contracts';
import { PromptEditor, type EditorProps } from './PromptEditor';
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
const categories = { system: 'Prompt tổng', image: 'Tạo ảnh', quality: 'Kiểm tra chất lượng' };
interface Props extends EditorProps {
  prompts: Prompt[];
  onSelect: (p: Prompt) => void;
  onNew: () => void;
  onImport: (file: File) => void;
}
export function PromptLibrary(props: Props) {
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [source, setSource] = useState(''),
    [favorite, setFavorite] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const results = props.prompts.filter(
    (p) =>
      (!category || p.category === category) &&
      (!source || p.source === source) &&
      (!favorite || p.isFavorite) &&
      normalize([p.name, p.nameRu, p.description, p.body, ...p.tags].join(' ')).includes(
        normalize(search),
      ),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CÔNG CỤ SÁNG TẠO</span>
          <h1>
            Kho Prompt<span className="count">{props.prompts.length}</span>
          </h1>
          <p className="muted">Библиотека промптов · Từ ý tưởng đến hình ảnh sản phẩm.</p>
        </div>
        <div className="actions">
          <button disabled={props.busy} onClick={() => file.current?.click()}>
            Nhập JSON
          </button>
          <button className="primary" disabled={props.busy} onClick={props.onNew}>
            + Tạo prompt mới
          </button>
          <input
            ref={file}
            type="file"
            disabled={props.busy}
            accept=".json,application/json"
            hidden
            aria-label="Tệp JSON"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              e.target.value = '';
              if (selected) props.onImport(selected);
            }}
          />
        </div>
      </div>
      <div className="filters">
        <label className="search">
          Tìm prompt
          <input
            type="search"
            placeholder="Tìm theo tên, nội dung, nhãn…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Danh mục lọc
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Tất cả danh mục</option>
            {Object.entries(categories).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nguồn
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Tất cả nguồn</option>
            <option value="system">Mặc định</option>
            <option value="seller">Của tôi</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          Yêu thích
        </label>
      </div>
      <div className="library">
        <section className="prompt-list" aria-label="Danh sách prompt">
          <div className="list-heading">
            {results.length} prompt <span>Chọn để biên tập ↗</span>
          </div>
          {!results.length && <p className="empty">Không tìm thấy prompt.</p>}
          {results.map((p) => (
            <button
              disabled={props.busy}
              key={p.id}
              className={'prompt-card ' + (props.prompt?.id === p.id ? 'selected' : '')}
              onClick={() => props.onSelect(p)}
            >
              <div className="card-meta">
                <span>{categories[p.category]}</span>
                <span>{p.isFavorite ? '★' : '↗'}</span>
              </div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div className="card-bottom">
                <span className="badge">{p.source === 'system' ? 'Mặc định' : 'Của tôi'}</span>
                <span>v{p.version}</span>
              </div>
              <small>
                Sửa: {new Date(p.updatedAt).toLocaleDateString('vi-VN')} · Dùng:{' '}
                {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleDateString('vi-VN') : 'Chưa dùng'}
              </small>
            </button>
          ))}
        </section>
        <PromptEditor {...props} />
      </div>
    </>
  );
}
