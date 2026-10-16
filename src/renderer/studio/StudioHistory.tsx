import type { StudioJob } from '../../shared/studio-contracts';
import { JobResult } from './JobResult';
export function StudioHistory({
  jobs,
  busy,
  onAction,
}: {
  jobs: StudioJob[];
  busy: boolean;
  onAction: (job: StudioJob, action: string) => void;
}) {
  return (
    <section>
      <h2>Lịch sử tác vụ ảnh</h2>
      {!jobs.length ? (
        <p className="empty">Chưa có tác vụ ảnh cho seller này.</p>
      ) : (
        jobs.map((job) => <JobResult key={job.id} job={job} busy={busy} onAction={onAction} />)
      )}
    </section>
  );
}
