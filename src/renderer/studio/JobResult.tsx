import type { StudioJob } from '../../shared/studio-contracts';
import { AssetThumb } from './SourceImages';
import { studioMessages } from '../../shared/studio-messages';
export const stateLabels: Record<StudioJob['state'], string> = {
  queued: 'Chờ xác nhận chạy',
  generating: 'Đang tạo ảnh',
  auditing: 'Đang kiểm định',
  awaiting_review: 'Chờ seller duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  failed: 'Lỗi',
  uncertain: 'Chưa rõ kết quả · Có thể đã phát sinh phí',
  audit_failed: 'Ảnh đã tạo · Kiểm định lỗi',
};
export function JobResult({
  job,
  busy,
  onAction,
}: {
  job: StudioJob;
  busy: boolean;
  onAction: (job: StudioJob, action: string) => void;
}) {
  const report = job.qualityReport;
  return (
    <article className="studio-panel job-result">
      <div className="editor-top">
        <div>
          <h2>{job.snapshot.image.name}</h2>
          <p className="badge">{stateLabels[job.state]}</p>
          <small>{new Date(job.createdAt).toLocaleString('vi-VN')}</small>
        </div>
        {job.outputAssetIds.length > 0 && <AssetThumb id={job.outputAssetIds.at(-1)!} />}
      </div>
      {job.errorCode && (
        <p className="warning">
          {studioMessages[job.errorCode] ?? 'Tác vụ gặp lỗi; chưa được duyệt.'}
        </p>
      )}
      {report && (
        <>
          <h3>
            Kiểm định:{' '}
            {report.verdict === 'pass'
              ? 'Đạt'
              : report.verdict === 'fail'
                ? 'Không đạt'
                : 'Cần kiểm tra thủ công'}
          </h3>
          <p className="notice">
            Kiểm định AI chỉ hỗ trợ đánh giá. Seller cần đối chiếu ảnh gốc; không coi ảnh tạo là
            bằng chứng đặc tính thật.
          </p>
          {[
            ['Điểm đạt', report.passed],
            ['Lỗi phát hiện', report.errors],
          ].map(([title, items]) => (
            <div key={title as string}>
              <strong>{title as string}</strong>
              <ul>
                {(items as typeof report.passed).map((f, i) => (
                  <li key={i}>
                    {f.description} · Độ tin cậy {Math.round(f.confidence * 100)}%
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {report.repairPrompt && (
            <details>
              <summary>Gợi ý sửa</summary>
              <pre>{report.repairPrompt}</pre>
            </details>
          )}
        </>
      )}
      <div className="actions">
        {job.state === 'queued' && (
          <>
            <button disabled={busy} onClick={() => onAction(job, 'run')}>
              Tiếp tục tác vụ
            </button>
            <button disabled={busy} onClick={() => onAction(job, 'cancel')}>
              Dừng các ảnh chưa gửi
            </button>
          </>
        )}
        {job.state === 'awaiting_review' && (
          <>
            <button
              className="primary"
              disabled={busy || report?.verdict === 'fail'}
              onClick={() => onAction(job, 'approve')}
            >
              Duyệt ảnh
            </button>
            <button disabled={busy} onClick={() => onAction(job, 'reject')}>
              Từ chối ảnh
            </button>
          </>
        )}
        {job.state === 'audit_failed' && (
          <button disabled={busy} onClick={() => onAction(job, 'audit')}>
            Kiểm định lại · Có thể phát sinh phí
          </button>
        )}
        {job.state === 'approved' && (
          <button className="primary" disabled={busy} onClick={() => onAction(job, 'export')}>
            Xuất ảnh đã duyệt
          </button>
        )}
      </div>
      <details>
        <summary>Snapshot prompt và phiên bản</summary>
        <p>{job.snapshot.ids.map((id, i) => id + ' v' + job.snapshot.versions[i]).join(' · ')}</p>
        <pre>{job.snapshot.finalPrompt}</pre>
        <p className="muted">
          {job.originalAssetIds.length} ảnh nguồn · {job.snapshot.aspectRatio}
        </p>
      </details>
    </article>
  );
}
