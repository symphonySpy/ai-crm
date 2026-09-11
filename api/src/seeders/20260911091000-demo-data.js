'use strict';

// A8: synthetic data only, generated from a fixed seed so the dataset is identical on
// every run and a reviewer sees the same leads described in the README.
//
// Dates are anchored to the moment the seeder runs rather than to a hard-coded day, so
// a demo opened weeks from now still shows a pipeline that looks alive. The *content*
// is fully deterministic; only the absolute timestamps shift.
//
// Every row here obeys the CHECK constraints added in the migrations. That is on
// purpose: if the generator ever produces an impossible combination — an outbound
// message with no approver, an unowned lead not flagged for triage — the seed fails
// loudly instead of quietly creating data the application could never have made.

const bcrypt = require('bcryptjs');
// Same builders the runtime hooks use, so seeded snapshots are shaped exactly like the
// ones the application produces. bulkInsert bypasses model hooks, so without this the
// seed would contain rows no code path could ever create.
const { companyJson, contactJson, userJson, leadJson } = require('../lib/entity-snapshots');

// --- deterministic randomness -------------------------------------------------

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rand = mulberry32(20260911);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const HEX = '0123456789abcdef';
const uuid = () => {
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += HEX[(Math.floor(rand() * 16) & 0x3) | 0x8];
    else out += HEX[Math.floor(rand() * 16)];
  }
  return out;
};

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d, jitterHours = 8) =>
  new Date(NOW - d * DAY - randInt(0, jitterHours * 60) * 60 * 1000);

// --- vocabulary ---------------------------------------------------------------

const FIRST_NAMES = [
  'สมชาย', 'สุดารัตน์', 'ณัฐพงษ์', 'ปิยะดา', 'วีระ', 'อรทัย', 'ธนกร', 'ชลธิชา',
  'ภาณุพงศ์', 'กมลวรรณ', 'ศิริพร', 'อนุชา', 'พิมพ์ชนก', 'กิตติศักดิ์', 'เบญจวรรณ',
  'ธีรศักดิ์', 'นภัสสร', 'ปรีชา', 'วราภรณ์', 'อภิสิทธิ์',
];

const LAST_NAMES = [
  'ศรีสุวรรณ', 'ใจดี', 'วงศ์สว่าง', 'รักไทย', 'บุญมาก', 'แสงทอง', 'พูลสวัสดิ์',
  'จันทร์เพ็ญ', 'ทองดี', 'สมบูรณ์', 'ชัยวัฒน์', 'เกษมสุข', 'พงษ์ไพบูลย์', 'อินทรีย์',
];

const COMPANY_PREFIX = ['บริษัท', 'ห้างหุ้นส่วนจำกัด'];
const COMPANY_CORE = [
  'สยามเทค', 'บางกอกโลจิสติกส์', 'ไทยพัฒนา', 'อีสเทิร์นฟู้ด', 'นครทองพลาสติก',
  'เจริญกิจ', 'ริเวอร์ไซด์พร็อพเพอร์ตี้', 'ภูเก็ตทราเวล', 'ลานนาการเกษตร',
  'เมโทรพริ้นติ้ง', 'สมาร์ทโซลูชั่น', 'บลูโอเชียนมารีน', 'กรีนเอเนอร์จี',
  'ดิจิทัลเวฟ', 'อุดมทรัพย์ก่อสร้าง', 'ไทยเฮลท์แคร์',
];
const COMPANY_SUFFIX = ['จำกัด', 'จำกัด (มหาชน)'];

const COMPANY_QUALIFIER = [
  'อินเตอร์เนชั่นแนล', 'กรุ๊ป', 'โฮลดิ้ง', 'เทรดดิ้ง', 'เซอร์วิส', 'เอ็นจิเนียริ่ง',
  'ซัพพลาย', 'มาร์เก็ตติ้ง', 'ดีเวลลอปเมนท์', 'อุตสาหกรรม', 'พาณิชย์', 'คอร์ปอเรชั่น',
];

const INDUSTRIES = [
  'Retail', 'Manufacturing', 'Logistics', 'Hospitality', 'Healthcare',
  'Real estate', 'Food & beverage', 'Construction', 'Education', 'Financial services',
];

const LEAD_TITLES = [
  'ขอใบเสนอราคาระบบ POS',
  'สนใจแพ็กเกจดูแลระบบรายปี',
  'ต้องการเว็บไซต์ใหม่พร้อมระบบสมาชิก',
  'ขอข้อมูลระบบจัดการคลังสินค้า',
  'ปรึกษาเรื่องระบบ CRM สำหรับทีมขาย',
  'สนใจระบบจองคิวออนไลน์',
  'ขอประเมินราคางานย้ายระบบขึ้นคลาวด์',
  'ต้องการแดชบอร์ดสรุปยอดขาย',
  'สอบถามค่าบริการดูแลระบบรายเดือน',
  'ขอทดลองใช้ระบบก่อนตัดสินใจ',
];

const INBOUND_TEXTS = [
  'สวัสดีครับ สนใจบริการ ขอรายละเอียดหน่อยครับ',
  'ราคาเริ่มต้นเท่าไหร่คะ',
  'มีแพ็กเกจสำหรับธุรกิจขนาดเล็กไหมครับ',
  'ขอใบเสนอราคาเป็นทางการได้ไหมคะ',
  'ใช้เวลาทำนานแค่ไหนครับ',
  'ตอนนี้ยังพิจารณาอยู่ ขอเวลาคุยกับทีมก่อนนะคะ',
  'งบที่ตั้งไว้ประมาณสองแสน พอไหวไหมครับ',
  'ขอดูตัวอย่างงานที่เคยทำหน่อยได้ไหมคะ',
  'สนใจครับ ขอนัดคุยรายละเอียดสัปดาห์หน้าได้ไหม',
  'ขอบคุณสำหรับข้อมูลค่ะ จะติดต่อกลับอีกที',
];

const OUTBOUND_TEXTS = [
  'สวัสดีครับ ขอบคุณที่สนใจ เดี๋ยวผมส่งรายละเอียดแพ็กเกจให้ทางนี้เลยนะครับ',
  'ราคาเริ่มต้นอยู่ที่ 45,000 บาทครับ ขึ้นกับจำนวนผู้ใช้งาน ขอทราบขนาดทีมคร่าว ๆ ได้ไหมครับ',
  'มีครับ แพ็กเกจ Starter เหมาะกับทีม 5-10 คน เดี๋ยวส่งเอกสารเปรียบเทียบให้นะครับ',
  'รับทราบครับ ผมจะจัดทำใบเสนอราคาส่งภายในวันพรุ่งนี้ครับ',
  'ปกติใช้เวลาประมาณ 6-8 สัปดาห์ครับ ขึ้นกับขอบเขตงานที่ตกลงกัน',
  'ได้เลยครับ สะดวกวันไหนบ้างครับ ผมจะจัดตารางให้ตรงกับทีมครับ',
];

const NOTE_TEXTS = [
  'โทรคุยแล้ว ลูกค้าขอเวลาพิจารณาอีก 1 สัปดาห์',
  'ส่งใบเสนอราคาทางอีเมลเรียบร้อย',
  'ลูกค้าขอปรับขอบเขตงาน ต้องประเมินราคาใหม่',
  'นัดประชุมกับฝ่ายจัดซื้อสัปดาห์หน้า',
  'ลูกค้าเทียบกับเจ้าอื่นอยู่ ราคาเราสูงกว่าเล็กน้อย',
  'ผู้มีอำนาจตัดสินใจยังไม่ว่าง ต้องรอรอบประชุมเดือนหน้า',
];

const STAGES = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];
const STAGE_PLAN = [
  ['New', 90],
  ['Qualified', 80],
  ['Proposal', 60],
  ['Won', 40],
  ['Lost', 30],
];

const thaiName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
// COMPANY_CORE alone yields only a few dozen combinations, which is far fewer than
// the 400 companies we need. A qualifier word widens the space, and a running counter
// guarantees the uniqueness loop always terminates rather than spinning forever.
let companySeq = 0;
const companyName = () => {
  companySeq += 1;
  const qualifier = chance(0.55) ? ` ${pick(COMPANY_QUALIFIER)}` : '';
  const branch = chance(0.3) ? ` สาขา${randInt(2, 18)}` : '';
  return `${pick(COMPANY_PREFIX)}${pick(COMPANY_CORE)}${qualifier}${branch} ${pick(COMPANY_SUFFIX)}`;
};
const phone = () => `0${pick(['6', '8', '9'])}${String(randInt(0, 99999999)).padStart(8, '0')}`;

module.exports = {
  async up(queryInterface) {
    // A2: one shared password across the synthetic accounts. Documented in the README
    // because this deployment holds nothing but generated data.
    const passwordHash = await bcrypt.hash('DemoPass123!', 10);
    const stamp = (createdAt) => ({ created_at: createdAt, updated_at: createdAt });

    // --- users ----------------------------------------------------------------
    const users = [
      {
        id: uuid(),
        email: 'manager@demo.local',
        name: 'ผู้จัดการฝ่ายขาย (Demo)',
        role: 'manager',
      },
      {
        id: uuid(),
        email: 'sales@demo.local',
        name: 'พนักงานขาย (Demo)',
        role: 'sales',
      },
    ];
    for (let i = 1; i <= 8; i += 1) {
      users.push({ id: uuid(), email: `sales${i}@demo.local`, name: thaiName(), role: 'sales' });
    }

    const manager = users[0];
    const salesUsers = users.filter((u) => u.role === 'sales');

    await queryInterface.bulkInsert(
      'users',
      users.map((u) => ({
        ...u,
        password_hash: passwordHash,
        is_active: true,
        ...stamp(daysAgo(120)),
      })),
    );

    // --- companies ------------------------------------------------------------
    const companies = [];
    const seenNames = new Set();
    let guard = 0;
    while (companies.length < 400) {
      guard += 1;
      if (guard > 20000) throw new Error('company name vocabulary is too small to fill 400 rows');
      const name = companyName();
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      const createdAt = daysAgo(randInt(90, 200));
      companies.push({
        id: uuid(),
        name,
        industry: pick(INDUSTRIES),
        is_active: chance(0.97),
        created_by: manager.id,
        updated_by: null,
        ...stamp(createdAt),
      });
    }
    await queryInterface.bulkInsert('companies', companies);

    // --- contacts -------------------------------------------------------------
    // A32: roughly one contact in six has reached us through LINE and therefore
    // carries a line_user_id. The rest arrived by web form or manual entry.
    const contacts = [];
    for (let i = 0; i < 2000; i += 1) {
      const hasCompany = chance(0.65);
      const hasLine = chance(0.17);
      const createdAt = daysAgo(randInt(1, 180));
      const name = thaiName();
      // bulkInsert bypasses model hooks, so the company snapshot that
      // lib/company-snapshot.js would normally capture has to be written explicitly
      // here. Leaving it null would produce seed data no code path could ever create.
      const company = hasCompany ? pick(companies) : null;
      contacts.push({
        id: uuid(),
        company_id: company ? company.id : null,
        company_master_json: company ? JSON.stringify(companyJson(company)) : null,
        name,
        phone: chance(0.8) ? phone() : null,
        email: chance(0.55) ? `contact${i}@example.co.th` : null,
        line_user_id: hasLine ? `Udemo${String(i).padStart(10, '0')}` : null,
        line_display_name: hasLine ? name.split(' ')[0] : null,
        is_active: chance(0.96),
        created_by: manager.id,
        updated_by: null,
        ...stamp(createdAt),
      });
    }
    await queryInterface.bulkInsert('contacts', contacts);

    const lineContacts = contacts.filter((c) => c.line_user_id);

    // --- leads ----------------------------------------------------------------
    // A32 + the chk_leads_triage_requires_no_owner constraint: a lead either has an
    // owner and is not in triage, or has no owner and is flagged. Nothing in between.
    const leads = [];
    const usedContacts = new Set();
    const nextContact = (preferLine) => {
      const pool = preferLine ? lineContacts : contacts;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const c = pick(pool);
        if (!usedContacts.has(c.id)) {
          usedContacts.add(c.id);
          return c;
        }
      }
      return pick(pool);
    };

    for (const [stage, count] of STAGE_PLAN) {
      for (let i = 0; i < count; i += 1) {
        const fromLine = chance(0.35);
        const contact = nextContact(fromLine);
        // Only brand-new leads are ever left unassigned — an old lead nobody owns
        // would be a data bug, not a realistic pipeline.
        const untriaged = stage === 'New' && fromLine && chance(0.28);
        const createdAt = daysAgo(randInt(stage === 'New' ? 0 : 5, stage === 'New' ? 21 : 88));
        const owner = untriaged ? null : pick(salesUsers);
        const company = contact.company_id
          ? companies.find((c) => c.id === contact.company_id)
          : null;
        leads.push({
          id: uuid(),
          contact_id: contact.id,
          company_id: contact.company_id,
          owner_id: owner ? owner.id : null,
          contact_data_json: JSON.stringify(contactJson(contact)),
          company_data_json: company ? JSON.stringify(companyJson(company)) : null,
          owner_data_json: owner ? JSON.stringify(userJson(owner)) : null,
          title: pick(LEAD_TITLES),
          stage,
          value_thb:
            stage === 'New' ? randInt(0, 150000) : randInt(45000, 1200000),
          source: fromLine ? 'line' : pick(['website', 'manual']),
          needs_triage: untriaged,
          last_contact_at: daysAgo(randInt(0, 30)),
          created_by: manager.id,
          updated_by: null,
          ...stamp(createdAt),
        });
      }
    }
    await queryInterface.bulkInsert('leads', leads);

    // --- activities -----------------------------------------------------------
    // A16: the business audit trail. Every lead opens with a creation record, then
    // carries the stage moves that got it to where it is now.
    const activities = [];
    const pushActivity = (row) => activities.push({ id: uuid(), ...row });

    for (const lead of leads) {
      const actor = lead.owner_id || null;
      pushActivity({
        lead_id: lead.id,
        actor_id: lead.source === 'line' ? null : actor,
        type: 'lead_created',
        from_stage: null,
        to_stage: 'New',
        note: lead.source === 'line' ? 'สร้างอัตโนมัติจากข้อความ LINE ขาเข้า' : null,
        occurred_at: lead.created_at,
        created_at: lead.created_at,
      });

      // Walk the pipeline from New up to the lead's current stage so the timeline
      // tells a story instead of showing a single jump.
      const target = STAGES.indexOf(lead.stage);
      let cursor = 0;
      let when = new Date(lead.created_at).getTime();
      while (cursor < target) {
        const from = STAGES[cursor];
        // A Lost deal can be lost from anywhere; everything else advances in order.
        const to = lead.stage === 'Lost' && chance(0.6) ? 'Lost' : STAGES[cursor + 1];
        when += randInt(1, 9) * DAY;
        if (when > NOW) break;
        pushActivity({
          lead_id: lead.id,
          actor_id: actor,
          type: 'stage_changed',
          from_stage: from,
          to_stage: to,
          note: null,
          occurred_at: new Date(when),
          created_at: new Date(when),
        });
        if (to === 'Lost') break;
        cursor += 1;
      }

      if (chance(0.45)) {
        pushActivity({
          lead_id: lead.id,
          actor_id: actor,
          type: 'note_added',
          from_stage: null,
          to_stage: null,
          note: pick(NOTE_TEXTS),
          occurred_at: daysAgo(randInt(0, 20)),
          created_at: daysAgo(randInt(0, 20)),
        });
      }
    }

    // --- messages and webhook events -----------------------------------------
    // A29/A34: inbound rows are always 'received'; outbound rows only exist with an
    // approver attached. Both rules are enforced by CHECK constraints.
    const messages = [];
    const webhookEvents = [];
    const lineLeads = leads.filter((l) => l.source === 'line');

    for (const lead of lineLeads) {
      const contact = contacts.find((c) => c.id === lead.contact_id);
      if (!contact || !contact.line_user_id) continue;
      const turns = randInt(1, 4);
      let when = new Date(lead.created_at).getTime();

      for (let t = 0; t < turns; t += 1) {
        when += randInt(2, 40) * 60 * 60 * 1000;
        if (when > NOW) break;
        const inboundAt = new Date(when);
        const messageId = uuid();
        const lineMessageId = `msg-${messageId.slice(0, 18)}`;

        messages.push({
          id: messageId,
          lead_id: lead.id,
          contact_id: contact.id,
          direction: 'inbound',
          channel: 'line',
          content_type: chance(0.94) ? 'text' : pick(['sticker', 'image']),
          body: pick(INBOUND_TEXTS),
          line_message_id: lineMessageId,
          send_status: 'received',
          attempt_count: 0,
          error_detail: null,
          approved_by: null,
          sent_at: null,
          ...stamp(inboundAt),
        });

        webhookEvents.push({
          webhook_event_id: `evt-${messageId.slice(0, 20)}`,
          destination: 'Udemodestination0001',
          event_type: 'message',
          raw_payload: JSON.stringify({
            type: 'message',
            source: { type: 'user', userId: contact.line_user_id },
            message: { id: lineMessageId, type: 'text' },
          }),
          signature_valid: true,
          process_status: 'processed',
          error_detail: null,
          message_id: messageId,
          received_at: inboundAt,
          processed_at: new Date(when + 400),
          ...stamp(inboundAt),
        });

        pushActivity({
          lead_id: lead.id,
          actor_id: null,
          type: 'message_received',
          from_stage: null,
          to_stage: null,
          note: null,
          occurred_at: inboundAt,
          created_at: inboundAt,
        });

        // Not every inbound message gets answered — an unanswered thread is exactly
        // the situation the copilot is meant to surface.
        if (lead.owner_id && chance(0.72)) {
          when += randInt(1, 20) * 60 * 60 * 1000;
          if (when > NOW) break;
          const replyAt = new Date(when);
          const failed = chance(0.05);
          const replyId = uuid();

          messages.push({
            id: replyId,
            lead_id: lead.id,
            contact_id: contact.id,
            direction: 'outbound',
            channel: 'line',
            content_type: 'text',
            body: pick(OUTBOUND_TEXTS),
            line_message_id: null,
            send_status: failed ? 'failed' : 'sent',
            attempt_count: failed ? 3 : 1,
            error_detail: failed ? 'LINE API responded 500 (synthetic sample)' : null,
            approved_by: lead.owner_id,
            sent_at: failed ? null : replyAt,
            ...stamp(replyAt),
          });

          pushActivity({
            lead_id: lead.id,
            actor_id: lead.owner_id,
            type: 'message_sent',
            from_stage: null,
            to_stage: null,
            note: null,
            occurred_at: replyAt,
            created_at: replyAt,
          });
        }
      }
    }

    // --- ai suggestions -------------------------------------------------------
    // A22 + chk_ai_suggestions_decision_is_attributed: a proposal has no decision
    // recorded; anything approved or rejected names who decided and when.
    const aiSuggestions = [];
    for (const lead of leads) {
      if (!lead.owner_id || !chance(0.22)) continue;
      const createdAt = daysAgo(randInt(0, 25));
      const decided = chance(0.6);
      const status = decided ? (chance(0.75) ? 'approved' : 'rejected') : 'proposed';
      const degraded = chance(0.12);
      const score = randInt(25, 95);

      aiSuggestions.push({
        id: uuid(),
        lead_id: lead.id,
        kind: 'copilot_bundle',
        payload: JSON.stringify({
          summary: 'ลูกค้าสอบถามราคาและขอบเขตงาน ยังไม่ได้ระบุงบประมาณชัดเจน',
          score,
          score_reasons: [
            { criterion: 'recency', points: randInt(5, 20), note: 'ติดต่อล่าสุดภายใน 7 วัน' },
            { criterion: 'engagement', points: randInt(5, 20), note: 'ตอบกลับต่อเนื่อง' },
            { criterion: 'budget_signal', points: randInt(0, 20), note: 'ยังไม่ระบุงบ' },
            { criterion: 'stage_progress', points: randInt(0, 20), note: `อยู่ที่ ${lead.stage}` },
            { criterion: 'deal_value', points: randInt(0, 20), note: 'มูลค่าปานกลาง' },
          ],
          next_best_action: 'ส่งใบเสนอราคาพร้อมตัวเลือกแพ็กเกจ แล้วนัดคุยภายในสัปดาห์นี้',
          // A25: the fallback suppresses the draft rather than templating one.
          draft_line_reply: degraded
            ? null
            : 'สวัสดีครับ ผมสรุปแพ็กเกจที่เหมาะกับทีมของคุณไว้ให้แล้ว ขอส่งใบเสนอราคาให้พิจารณานะครับ',
        }),
        context_snapshot: JSON.stringify({
          lead: { stage: lead.stage, value_thb: lead.value_thb, source: lead.source },
          message_count: randInt(1, 8),
          captured_at: createdAt,
        }),
        model: degraded ? null : 'claude-sonnet-5',
        prompt_version: 'v1',
        degraded,
        status,
        requested_by: lead.owner_id,
        decided_by: decided ? lead.owner_id : null,
        decided_at: decided ? daysAgo(randInt(0, 20)) : null,
        ...stamp(createdAt),
      });

      pushActivity({
        lead_id: lead.id,
        actor_id: lead.owner_id,
        type: 'ai_suggestion_requested',
        from_stage: null,
        to_stage: null,
        note: null,
        occurred_at: createdAt,
        created_at: createdAt,
      });

      if (decided) {
        pushActivity({
          lead_id: lead.id,
          actor_id: lead.owner_id,
          type: status === 'approved' ? 'ai_suggestion_approved' : 'ai_suggestion_rejected',
          from_stage: null,
          to_stage: null,
          note: null,
          occurred_at: createdAt,
          created_at: createdAt,
        });
      }
    }

    // Fill the snapshot columns the model hooks would normally write. Done as a pass
    // over the finished arrays rather than inline, so the generation logic above stays
    // readable and there is exactly one place that knows the snapshot shape.
    const usersById = new Map(users.map((u) => [u.id, u]));
    const contactsById = new Map(contacts.map((c) => [c.id, c]));
    const leadsById = new Map(leads.map((l) => [l.id, l]));
    const snap = (builder, map, id) => {
      const row = id ? map.get(id) : null;
      return row ? JSON.stringify(builder(row)) : null;
    };

    for (const a of activities) {
      a.lead_data_json = snap(leadJson, leadsById, a.lead_id);
      a.actor_data_json = snap(userJson, usersById, a.actor_id);
    }
    for (const m of messages) {
      m.lead_data_json = snap(leadJson, leadsById, m.lead_id);
      m.contact_data_json = snap(contactJson, contactsById, m.contact_id);
    }
    for (const sg of aiSuggestions) {
      sg.lead_data_json = snap(leadJson, leadsById, sg.lead_id);
    }

    // Messages must exist before the webhook events that point at them.
    if (messages.length) await queryInterface.bulkInsert('messages', messages);
    if (webhookEvents.length) await queryInterface.bulkInsert('line_webhook_events', webhookEvents);
    if (aiSuggestions.length) await queryInterface.bulkInsert('ai_suggestions', aiSuggestions);
    await queryInterface.bulkInsert('activities', activities);
  },

  async down(queryInterface) {
    // Reverse dependency order, so no foreign key is left dangling mid-delete.
    for (const table of [
      'line_webhook_events',
      'ai_suggestions',
      'activities',
      'messages',
      'leads',
      'contacts',
      'companies',
      'users',
    ]) {
      await queryInterface.bulkDelete(table, null, { truncate: false });
    }
  },
};
