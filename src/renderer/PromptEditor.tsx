import type { Prompt, PromptInput, PromptVersion } from '../shared/contracts';
import { PromptPreview } from './PromptPreview';
import { PromptHistory } from './PromptHistory';
export const blank: PromptInput = {
  name: '',
  nameRu: '',
  description: '',
  category: 'image',
  body: '',
  tags: [],
  group: '',
  mode: 'hero_image',
};
export function toInput(p: PromptInput): PromptInput {
  return {
    name: p.name,
    nameRu: p.nameRu,
    description: p.description,
    category: p.category,
    body: p.body,
    tags: [...p.tags],
    group: p.group,
    mode: p.mode,
  };
}
export interface EditorProps {
  prompt: Prompt | null;
  draft: PromptInput;
  dirty: boolean;
  busy: boolean;
  versions: PromptVersion[];
  defaults: Record<string, string>;
  onChange: (p: PromptInput) => void;
  onSave: (copy?: boolean) => void;
  onAction: (action: string, arg?: number) => void;
}
export function PromptEditor({
  prompt,
  draft,
  dirty,
  busy,
  versions,
  defaults,
  onChange,
  onSave,
  onAction,
}: EditorProps) {
  const patch = (p: Partial<PromptInput>) => onChange({ ...draft, ...p });
  return (
    <article className="editor" aria-label="Trình soạn thảo prompt">
      <div className="editor-top">
        <div>
          <span className="eyebrow">
            {prompt?.source === 'system'
              ? 'PROMPT HỆ THỐNG'
              : prompt
                ? 'PROMPT CỦA TÔI'
                : 'PROMPT MỚI'}
          </span>
          <h2>{prompt?.name ?? 'Tạo prompt mới'}</h2>
          <p className="muted">
            {prompt
              ? `Phiên bản ${prompt.version} · ${new Date(prompt.updatedAt).toLocaleString('vi-VN')}`
              : 'Nội dung chỉ thuộc seller hiện hành.'}
            {dirty ? ' · Chưa lưu' : ''}
          </p>
        </div>
        {prompt && (
          <button
            disabled={busy}
            aria-label="Yêu thích prompt"
            aria-pressed={prompt.isFavorite}
            onClick={() => onAction('favorite')}
          >
            {prompt.isFavorite ? '★' : '☆'}
          </button>
        )}
      </div>
      {prompt?.source === 'system' && (
        <p className="notice">
          Khi lưu chỉnh sửa, ứng dụng tạo bản cá nhân. Bản mặc định vẫn được giữ nguyên.
        </p>
      )}
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label>
            Tên prompt
            <input
              id="prompt-name"
              maxLength={200}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            Tên tiếng Nga
            <input
              maxLength={200}
              value={draft.nameRu}
              onChange={(e) => patch({ nameRu: e.target.value })}
            />
          </label>
          <label className="wide">
            Mô tả
            <input
              maxLength={2000}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <label>
            Danh mục
            <select
              value={draft.category}
              onChange={(e) => patch({ category: e.target.value as PromptInput['category'] })}
            >
              <option value="system">Prompt tổng</option>
              <option value="image">Tạo ảnh</option>
              <option value="quality">Kiểm tra chất lượng</option>
            </select>
          </label>
          <label>
            Chế độ ảnh
            <input
              value={draft.mode}
              maxLength={100}
              onChange={(e) => patch({ mode: e.target.value })}
            />
          </label>
          <label>
            Nhóm
            <input
              maxLength={100}
              value={draft.group}
              onChange={(e) => patch({ group: e.target.value })}
            />
          </label>
          <label>
            Nhãn (phân cách bằng dấu phẩy)
            <input
              value={draft.tags.join(',')}
              onChange={(e) => patch({ tags: e.target.value.split(',').slice(0, 30) })}
            />
          </label>
        </div>
        <label className="body-label">
          Nội dung prompt
          <textarea
            aria-label="Nội dung prompt"
            value={draft.body}
            maxLength={50000}
            spellCheck={false}
            onChange={(e) => patch({ body: e.target.value })}
          />
        </label>
        <p className="muted">
          {draft.body.length.toLocaleString('vi-VN')} / 50.000 ký tự · Biến:{' '}
          <mark>
            {[...draft.body.matchAll(/{{[^{}]+}}/g)].map((m) => m[0]).join(' · ') || 'Không có'}
          </mark>
        </p>
        <div className="actions">
          <button
            className="primary"
            disabled={!draft.name.trim() || !draft.body.trim()}
            onClick={() => onSave()}
          >
            Lưu
          </button>
          <button disabled={!draft.name.trim() || !draft.body.trim()} onClick={() => onSave(true)}>
            Lưu thành bản mới
          </button>
          {prompt && (
            <>
              <button onClick={() => onAction('clone')}>Nhân bản</button>
              <button onClick={() => onAction('rename')}>Đổi tên</button>
              <button onClick={() => onAction('export')}>Xuất JSON</button>
              <button disabled={!draft.mode.trim() || dirty} onClick={() => onAction('default')}>
                Đặt làm mặc định của tôi
              </button>
              <button disabled={dirty} onClick={() => onAction('use')}>
                Dùng trong AI Studio
              </button>
              <button disabled title="Chưa kết nối API tạo ảnh và kiểm định">
                Kiểm thử bằng ảnh gốc · Chưa kết nối
              </button>
              {prompt.systemPromptId && prompt.source === 'seller' && (
                <button onClick={() => onAction('reset')}>Khôi phục prompt mặc định</button>
              )}
              {prompt.source === 'seller' && (
                <button className="danger" onClick={() => onAction('delete')}>
                  Xóa
                </button>
              )}
            </>
          )}
        </div>
      </fieldset>
      {prompt && Object.entries(defaults).some(([, id]) => id === prompt.id) && (
        <p className="notice">
          Mặc định của tôi:{' '}
          {Object.entries(defaults)
            .filter(([, id]) => id === prompt.id)
            .map(([mode]) => mode)
            .join(', ')}
        </p>
      )}
      <PromptPreview body={draft.body} />
      {prompt && (
        <PromptHistory versions={versions} busy={busy} onRestore={(v) => onAction('restore', v)} />
      )}
    </article>
  );
}
