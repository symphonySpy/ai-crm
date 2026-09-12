/**
 * Values that more than one screen needs to agree on.
 *
 * Kept narrow on purpose. tmk-admin's constants file grew into a dumping ground of
 * hundreds of codes, which is what happens when "shared" is the only criterion — the
 * test here is whether two places would otherwise disagree.
 */
import type { Stage } from '@/lib/types';

/** Pipeline order. Must match LEAD_STAGES in api/src/constants/enums.js. */
export const LEAD_STAGES: Stage[] = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];

/** Stages that still represent money in play. */
export const OPEN_STAGES: Stage[] = ['New', 'Qualified', 'Proposal'];

export const PAGE_SIZE = 25;

/** The API caps list queries at 100; asking for more is rejected, not truncated. */
export const MAX_PAGE_SIZE = 100;

/** Quiet time before a search fires. Per keystroke would be a LIKE across three joins. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Timeline entry types, as written by the API's activity.type enum. */
export const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: 'สร้าง lead',
  stage_changed: 'เปลี่ยนขั้น',
  owner_changed: 'เปลี่ยนเจ้าของ',
  note_added: 'เพิ่มบันทึก',
  message_received: 'ได้รับข้อความ',
  message_sent: 'ส่งข้อความ',
  ai_suggestion_requested: 'ขอคำแนะนำจาก AI',
  ai_suggestion_approved: 'อนุมัติคำแนะนำ',
  ai_suggestion_rejected: 'ปฏิเสธคำแนะนำ',
  contact_updated: 'แก้ไขผู้ติดต่อ',
};

/** The five scoring criteria the copilot always returns, in the order it returns them. */
export const CRITERION_LABELS: Record<string, string> = {
  recency: 'ความสดของการติดต่อ',
  engagement: 'การตอบโต้',
  budget_signal: 'สัญญาณงบประมาณ',
  stage_progress: 'ความคืบหน้า',
  deal_value: 'มูลค่าดีล',
};

/** Shown where an activity has no actor — the system did it, not a person. */
export const SYSTEM_ACTOR_LABEL = 'ระบบ';
