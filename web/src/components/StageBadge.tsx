import type { Stage } from '@/lib/types';

/** Stage carries meaning, so it gets colour — but the label is always present, because
 *  colour alone excludes anyone who cannot distinguish these hues. */
export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`badge stage-${stage}`}>{stage}</span>;
}

export function TriageBadge() {
  return <span className="badge badge-triage" title="ยังไม่มีเจ้าของ">รอคัดกรอง</span>;
}
