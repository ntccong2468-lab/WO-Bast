import { useState } from 'react';
import { interpolate, variableLabels, variables } from '../shared/interpolation';
export function PromptPreview({ body }: { body: string }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const result = interpolate(body, values);
  return (
    <section className="preview">
      <h3>Xem trước nội dung cuối</h3>
      <p className="muted">
        Điền giá trị để kiểm tra biến. Nội dung chỉ được hiển thị, chưa gửi đến API.
      </p>
      <div className="variable-grid">
        {variables.map((key) => (
          <label key={key}>
            {variableLabels[key] ?? key}
            <input
              value={values[key] ?? ''}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {result.missing.length > 0 && (
        <p className="warning">Biến chưa có giá trị: {result.missing.join(', ')}</p>
      )}
      {result.unsupported.length > 0 && (
        <p className="warning">Biến không hỗ trợ: {result.unsupported.join(', ')}</p>
      )}
      <pre>{result.text}</pre>
    </section>
  );
}
