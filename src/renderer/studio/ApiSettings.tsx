import { useEffect, useRef, useState } from 'react';
import type { SellerId } from '../../shared/contracts';
import type { CredentialStatus } from '../../shared/studio-contracts';
import { studioMessages } from '../../shared/studio-messages';
export function ApiSettings({
  seller,
  onBusyChange,
}: {
  seller: SellerId;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<CredentialStatus | null>(null),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    onBusyChange?.(true);
    window.vnPochta.credentials
      .status()
      .then((s) => {
        if (alive.current) setStatus(s);
      })
      .catch(() => {
        if (alive.current) setMessage('Không thể đọc trạng thái khóa.');
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
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setMessage('');
    try {
      await work();
      if (alive.current) setStatus(await window.vnPochta.credentials.status());
    } catch {
      if (alive.current)
        setMessage('Không thể lưu hoặc sử dụng khóa. Kiểm tra kho mã hóa của hệ điều hành.');
    } finally {
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  return (
    <section className="api-settings">
      <span className="eyebrow">KẾT NỐI DỊCH VỤ</span>
      <h1>Cấu hình OpenAI</h1>
      <p className="notice">
        {status?.configured
          ? status.source === 'environment'
            ? 'Đang dùng khóa môi trường dùng chung'
            : 'Đã lưu khóa riêng cho seller hiện hành'
          : 'Chưa có khóa API'}
      </p>
      <p>
        Ảnh chỉ được gửi khi bạn xác nhận tạo ảnh. Khóa lưu riêng cho {seller}, mã hóa bằng cơ chế
        bảo mật hệ điều hành.
      </p>
      {status?.source === 'environment' && (
        <p className="warning">
          Khóa môi trường được ưu tiên. Thay khóa đó trong Environment settings; khóa cá nhân đã lưu
          chỉ được dùng khi không có khóa môi trường.
        </p>
      )}
      {status && !status.canStore && (
        <p className="warning">
          Máy này chưa có kho mã hóa an toàn; không thể lưu khóa cá nhân. Hãy dùng cấu hình môi
          trường hoặc chạy app trên Windows.
        </p>
      )}
      <label>
        Khóa OpenAI API
        <input
          type="password"
          autoComplete="off"
          maxLength={1024}
          value={key}
          disabled={busy || !status?.canStore}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || !key.trim() || !status?.canStore}
          onClick={() => {
            const value = key;
            setKey('');
            void run(async () => {
              await window.vnPochta.credentials.save(value);
              if (alive.current) setMessage('Đã lưu khóa an toàn.');
            });
          }}
        >
          Lưu khóa an toàn
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await window.vnPochta.credentials.checkConnection();
              if (alive.current)
                setMessage(
                  r.ok
                    ? 'Kết nối thành công. Chưa xác minh quyền tạo ảnh.'
                    : (studioMessages[r.errorCode ?? ''] ?? 'Không thể kết nối OpenAI.'),
                );
            })
          }
        >
          Kiểm tra kết nối
        </button>
        <button
          disabled={busy || status?.source !== 'local'}
          onClick={() => {
            if (window.confirm('Xóa khóa cá nhân của seller này?'))
              void run(async () => {
                await window.vnPochta.credentials.remove();
                if (alive.current) setMessage('Đã xóa khóa cá nhân.');
              });
          }}
        >
          Xóa khóa cá nhân
        </button>
      </div>
      {busy && <p role="status">Đang xử lý…</p>}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p className="muted">
        Thành công ở bước kiểm tra khóa không đồng nghĩa tài khoản có quyền với mọi model. Không có
        khóa nào được hiển thị lại hoặc ghi vào log.
      </p>
    </section>
  );
}
