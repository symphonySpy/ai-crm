'use strict';

// A25: what the copilot returns when the model is unavailable or its answer fails
// validation.
//
// The scoring runs against the same five criteria as the prompt (prompt.js), so a
// degraded score sits on the same scale as a normal one — a salesperson comparing two
// leads is not silently comparing two different measurements.
//
// The draft reply is SUPPRESSED rather than templated. A canned "ขอบคุณที่สนใจครับ"
// sent into a conversation where the customer just asked about a contract term reads as
// a company that is not listening, and it cannot be recalled once sent. No suggestion is
// the honest answer when there is nothing to base one on.

const BUDGET_HINTS = [
  'งบ', 'ราคา', 'เท่าไหร่', 'เท่าไร', 'กี่บาท', 'ใบเสนอราคา', 'quotation', 'budget', 'price',
];

const points = (value, bands) => {
  for (const [threshold, score] of bands) {
    if (value !== null && value !== undefined && value <= threshold) return score;
  }
  return bands[bands.length - 1][1];
};

function scoreRecency(daysSince) {
  if (daysSince === null) return { points: 0, note: 'ไม่มีข้อมูลการติดต่อล่าสุด' };
  const p = points(daysSince, [[2, 18], [7, 14], [21, 8], [Infinity, 2]]);
  return { points: p, note: `ติดต่อล่าสุด ${daysSince} วันก่อน` };
}

function scoreEngagement(inboundCount) {
  const p = inboundCount >= 5 ? 18 : inboundCount >= 3 ? 14 : inboundCount === 2 ? 8 : 3;
  return { points: p, note: `ลูกค้าส่งข้อความมา ${inboundCount} ครั้ง` };
}

function scoreBudgetSignal(messages) {
  const text = messages
    .filter((m) => m.direction === 'inbound' && m.body)
    .map((m) => m.body)
    .join(' ')
    .toLowerCase();

  // Deliberately crude. A keyword match cannot tell "งบสองแสน" from "ไม่มีงบ", so it
  // scores the middle band and says what it actually found. Claiming more precision than
  // a keyword search has would make the number less trustworthy, not more.
  const hit = BUDGET_HINTS.find((k) => text.includes(k));
  if (!hit) return { points: 2, note: 'ยังไม่พบการพูดถึงงบประมาณหรือราคา' };
  return { points: 10, note: `พบการพูดถึงเรื่องราคาหรืองบประมาณ (คำว่า "${hit}")` };
}

function scoreStage(stage) {
  const table = { Proposal: 18, Qualified: 13, New: 7, Won: 2, Lost: 0 };
  return { points: table[stage] ?? 0, note: `อยู่ที่ขั้น ${stage}` };
}

function scoreValue(valueThb) {
  if (!valueThb) return { points: 1, note: 'ยังไม่ได้ระบุมูลค่าดีล' };
  const p = valueThb > 500000 ? 18 : valueThb >= 150000 ? 13 : 7;
  return { points: p, note: `มูลค่า ${valueThb.toLocaleString('en-US')} บาท` };
}

/**
 * Produce a complete, valid bundle without calling a model.
 *
 * Returns the same shape as the model path so nothing downstream has to branch on how
 * the suggestion was produced — only the `degraded` flag differs, and that exists so the
 * UI can label it (A25).
 */
function buildFallbackBundle(context, { reason } = {}) {
  const { lead, message_counts: counts, recent_messages: recent } = context;

  const reasons = [
    { criterion: 'recency', ...scoreRecency(lead.days_since_last_contact) },
    { criterion: 'engagement', ...scoreEngagement(counts.inbound) },
    { criterion: 'budget_signal', ...scoreBudgetSignal(recent) },
    { criterion: 'stage_progress', ...scoreStage(lead.stage) },
    { criterion: 'deal_value', ...scoreValue(lead.value_thb) },
  ];

  const score = reasons.reduce((sum, r) => sum + r.points, 0);

  const lastInbound = [...recent].reverse().find((m) => m.direction === 'inbound');
  const summary = lastInbound
    ? `สรุปจากข้อมูลในระบบ (ไม่ได้ใช้โมเดลภาษา): ลูกค้าติดต่อมา ${counts.inbound} ครั้ง ` +
      `ข้อความล่าสุดคือ "${String(lastInbound.text).slice(0, 160)}" ขั้นปัจจุบันคือ ${lead.stage}`
    : `สรุปจากข้อมูลในระบบ (ไม่ได้ใช้โมเดลภาษา): ยังไม่มีบทสนทนา ขั้นปัจจุบันคือ ${lead.stage}`;

  const nextAction =
    lead.days_since_last_contact !== null && lead.days_since_last_contact > 7
      ? 'ติดต่อกลับเพื่อสอบถามความคืบหน้า เนื่องจากเงียบมาเกินหนึ่งสัปดาห์'
      : 'อ่านบทสนทนาล่าสุดแล้วตอบคำถามที่ค้างอยู่ของลูกค้า';

  return {
    summary: summary.slice(0, 800),
    score,
    score_reasons: reasons,
    next_best_action:
      `${nextAction} — ระบบผู้ช่วยทำงานในโหมดสำรอง` +
      `${reason ? ` (${reason})` : ''} จึงไม่มีร่างข้อความให้`,
    // The point of the whole file.
    draft_line_reply: null,
  };
}

module.exports = { buildFallbackBundle };
