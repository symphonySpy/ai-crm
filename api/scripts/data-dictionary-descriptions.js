'use strict';

// Business meaning for every table and column. The generator pulls types, keys,
// indexes and constraints from information_schema; this file supplies the "why".
// When a migration adds a column, add its entry here — the generator warns about any
// column it cannot describe, so the dictionary cannot silently go stale.

const TABLE_ORDER = [
  'users',
  'companies',
  'contacts',
  'leads',
  'activities',
  'messages',
  'ai_suggestions',
  'line_webhook_events',
  'tbl_audit_history',
];

const TABLES = {
  users: {
    purpose: 'ผู้ใช้งานระบบ คือพนักงานขายและผู้จัดการ ไม่ใช่ลูกค้า',
    note:
      'ไม่มีการลบถาวร (A14) เพราะ `leads.owner_id` และ `activities.actor_id` อ้างถึงอยู่ ' +
      'พนักงานที่ลาออกให้ตั้ง `is_active = 0` แล้วโอน lead ให้คนอื่น',
  },
  companies: {
    purpose: 'บริษัทลูกค้า ใช้จัดกลุ่ม contact และ lead',
    note: 'ไม่บังคับ — lead จากช่องทาง LINE มักยังไม่รู้ว่าลูกค้าสังกัดบริษัทใด',
  },
  contacts: {
    purpose: 'บุคคลที่ติดต่อ คือลูกค้าหรือผู้มุ่งหวังตัวจริง',
    note:
      '`line_user_id` เป็น unique และเป็นกุญแจที่ใช้จับคู่ข้อความ LINE ขาเข้ากลับมาหา contact (A32)',
  },
  leads: {
    purpose: 'โอกาสทางการขาย เป็นออบเจ็กต์แกนกลางของทั้งระบบ',
    note:
      'ไม่แยกตาราง deal — lead ถือ `stage` และ `value_thb` ในตัว (A6) ' +
      'และไม่มี `is_active` เพราะ stage `Lost` ทำหน้าที่สถานะปลายทางแล้ว',
  },
  activities: {
    purpose: 'บันทึกเหตุการณ์ทั้งหมดของ lead คือ audit trail ระดับธุรกิจ',
    note:
      'เขียนอย่างเดียว ไม่มีการแก้หรือลบ จึงไม่มี `updated_at` (A16) ' +
      'ข้อมูล stage เก็บเป็นค่าไม่ใช่ FK เพื่อให้ประวัติเก่าอ่านออกแม้ pipeline เปลี่ยนชื่อ (A17)',
  },
  messages: {
    purpose: 'ข้อความสนทนากับลูกค้าทั้งขาเข้าและขาออก',
    note: 'ขาออกต้องมีผู้อนุมัติเสมอ บังคับด้วย CHECK constraint ไม่ใช่แค่กฎในโค้ด (A34)',
  },
  ai_suggestions: {
    purpose: 'ผลลัพธ์จาก AI copilot ที่ยังไม่ถือเป็นการกระทำจริง',
    note:
      'เป็นเส้นแบ่งหลักของระบบ (A22) AI เขียนได้เฉพาะตารางนี้ ' +
      'จะแก้ lead หรือส่งข้อความออกได้ต่อเมื่อมีคนเปลี่ยน `status` เท่านั้น',
  },
  tbl_audit_history: {
    purpose: 'ประวัติการแก้ไขและการปิดใช้งานของทุกตารางที่ตรวจสอบ 1 การแก้ = 1 แถว',
    note:
      'บอกครบว่าแก้ตารางไหน แถวไหน เปลี่ยนจากอะไรเป็นอะไร ใครแก้ เมื่อไร (A16) ' +
      'เก็บเฉพาะคอลัมน์ที่เปลี่ยนจริง ไม่ใช่ทั้งแถว แก้กี่ฟิลด์พร้อมกันก็ได้แถวเดียว ' +
      'การอ่านค่าย้อนหลังคือไล่ย้อนรายการที่เกิดหลังเวลาที่สนใจ · ' +
      '`activities` ไม่อยู่ในรายการเพราะเขียนอย่างเดียวอยู่แล้ว ตัวมันเองคือประวัติ',
  },
  line_webhook_events: {
    purpose: 'บันทึกดิบของทุก event ที่ LINE ส่งเข้ามา',
    note:
      '`webhook_event_id` เป็น primary key จึงเป็นกลไกกันข้อความซ้ำในตัว (A30) ' +
      'และเก็บ payload ดิบก่อนประมวลผลเพื่อให้ replay ได้ (A31)',
  },
};

const COLUMNS = {
  'users.id': 'รหัสผู้ใช้ UUID v4',
  'users.email': 'อีเมลที่ใช้เข้าสู่ระบบ ห้ามซ้ำ',
  'users.password_hash':
    'รหัสผ่านที่ผ่าน bcrypt แล้ว ไม่เคยถูกส่งออกทาง API เพราะโมเดลตัดออกด้วย defaultScope',
  'users.name': 'ชื่อที่แสดงในระบบ',
  'users.role':
    '`sales` เห็น lead ทั้งหมดแต่ส่งข้อความได้เฉพาะ lead ตัวเอง · `manager` ทำได้ทั้งหมด (A3)',
  'users.is_active': 'พนักงานที่ยังทำงานอยู่หรือไม่ ใช้แทนการลบ (A14)',
  'users.created_by': 'ผู้สร้างเรคคอร์ด · **ว่าง = ระบบเป็นผู้ทำ** เติมอัตโนมัติจาก `actorId` (A12)',
  'users.updated_by': 'ผู้แก้ไขล่าสุด · เปลี่ยนเฉพาะเมื่อมีข้อมูลอื่นเปลี่ยนจริง',
  'users.created_at': 'เวลาที่สร้างเรคคอร์ด (UTC)',
  'users.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC)',

  'companies.id': 'รหัสบริษัท UUID v4',
  'companies.name': 'ชื่อบริษัทลูกค้า',
  'companies.industry': 'กลุ่มอุตสาหกรรม ใช้จัดกลุ่มและกรอง',
  'companies.is_active': 'บริษัทที่ยังดำเนินกิจการอยู่หรือไม่',
  'companies.created_by': 'ผู้สร้างเรคคอร์ด (A12)',
  'companies.updated_by': 'ผู้แก้ไขล่าสุด',
  'companies.created_at': 'เวลาที่สร้างเรคคอร์ด (UTC)',
  'companies.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC)',

  'contacts.id': 'รหัสผู้ติดต่อ UUID v4',
  'contacts.company_id': 'บริษัทที่สังกัด ไม่บังคับ',
  'contacts.name': 'ชื่อผู้ติดต่อ ถ้ามนุษย์แก้แล้วถือเป็นชื่อหลัก (A33)',
  'contacts.phone': 'เบอร์โทรศัพท์',
  'contacts.email': 'อีเมลผู้ติดต่อ',
  'contacts.line_user_id': 'รหัสผู้ใช้ LINE ห้ามซ้ำ เป็นกุญแจจับคู่ข้อความขาเข้า (A32)',
  'contacts.line_display_name':
    'ชื่อที่แสดงบนโปรไฟล์ LINE ตอนติดต่อครั้งแรก ไม่ใช่ชื่อหลัก (A33)',
  'contacts.is_active': 'ผู้ติดต่อที่ยังใช้งานอยู่หรือไม่ ใช้แทนการลบ',
  'contacts.company_master_json':
    'ข้อมูลบริษัท ณ เวลาที่ผูก contact เข้ากับบริษัทนี้ · **ไม่ใช่ค่าปัจจุบัน** ค่าปัจจุบันอ่านจากการ join ผ่าน `company_id` เสมอ · ระบบเติมเองผ่าน hook เท่านั้น (A17)',
  'contacts.created_by': 'ผู้สร้างเรคคอร์ด · ว่างเมื่อระบบสร้างจากข้อความ LINE',
  'contacts.updated_by': 'ผู้แก้ไขล่าสุด',
  'contacts.created_at': 'เวลาที่สร้างเรคคอร์ด (UTC)',
  'contacts.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC)',

  'leads.id': 'รหัส lead UUID v4',
  'leads.contact_id': 'ผู้ติดต่อหลักของ lead นี้ บังคับ',
  'leads.company_id': 'บริษัทที่เกี่ยวข้อง ไม่บังคับ',
  'leads.owner_id': 'พนักงานขายเจ้าของ lead · ว่างได้เฉพาะเมื่อ `needs_triage = 1`',
  'leads.title': 'หัวข้อหรือความต้องการของลูกค้าโดยย่อ',
  'leads.stage':
    'ขั้นใน pipeline ย้ายได้ทุกทิศทางรวมถึงถอยหลัง ทุกครั้งบันทึกลง activities (A19)',
  'leads.value_thb':
    'มูลค่าดีลเป็นบาทเต็มจำนวน ชนิด UNSIGNED ฐานข้อมูลจึงปฏิเสธค่าติดลบ (A9)',
  'leads.source': 'ช่องทางที่ lead เข้ามา',
  'leads.needs_triage':
    'รอมอบหมายเจ้าของ ตั้งอัตโนมัติเมื่อระบบสร้าง lead จาก LINE ที่ยังไม่รู้จักผู้ส่ง (A32)',
  'leads.last_contact_at': 'เวลาที่มีการติดต่อล่าสุด ใช้เป็นเกณฑ์หนึ่งในการให้คะแนน',
  'leads.contact_data_json': 'ผู้ติดต่อ ณ เวลาที่ผูกกับ lead นี้ · ระบบเติมเองผ่าน hook (A17)',
  'leads.company_data_json': 'บริษัท ณ เวลาที่ผูกกับ lead นี้',
  'leads.owner_data_json': 'เจ้าของ lead ณ เวลาที่มอบหมาย · เปลี่ยนตามเมื่อเปลี่ยนเจ้าของ',
  'leads.created_by': 'ผู้สร้างเรคคอร์ด · ว่างเมื่อระบบสร้างจาก LINE',
  'leads.updated_by': 'ผู้แก้ไขล่าสุด',
  'leads.created_at': 'เวลาที่สร้างเรคคอร์ด (UTC)',
  'leads.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC)',

  'activities.id': 'รหัสเหตุการณ์ UUID v4',
  'activities.lead_id': 'lead ที่เหตุการณ์นี้เกิดขึ้น',
  'activities.actor_id':
    'ผู้กระทำ · **ว่าง = ระบบเป็นผู้กระทำ** เช่นข้อความ LINE ขาเข้าหรือ lead ที่สร้างอัตโนมัติ',
  'activities.type': 'ประเภทเหตุการณ์',
  'activities.from_stage':
    'stage ต้นทาง บังคับเมื่อ `type = stage_changed` · เก็บเป็นค่าไม่ใช่ FK (A17)',
  'activities.to_stage': 'stage ปลายทาง บังคับเมื่อ `type = stage_changed`',
  'activities.note': 'บันทึกข้อความของพนักงานขาย',
  'activities.occurred_at': 'เวลาที่เหตุการณ์เกิดขึ้นจริง (UTC) ใช้เรียง timeline',
  'activities.lead_data_json': 'lead ณ เวลาที่เหตุการณ์เกิด · บันทึกครั้งเดียวตอนสร้าง ไม่เปลี่ยนอีก',
  'activities.actor_data_json': 'ผู้กระทำ ณ เวลานั้น · ว่างเมื่อระบบเป็นผู้กระทำ',
  'activities.created_by': 'ผู้สร้างเรคคอร์ด · **ว่าง = ระบบเป็นผู้ทำ** เติมอัตโนมัติจาก `actorId` (A12)',
  'activities.updated_by': 'ผู้แก้ไขล่าสุด · เปลี่ยนเฉพาะเมื่อมีข้อมูลอื่นเปลี่ยนจริง',
  'activities.created_at':
    'เวลาที่บันทึกลงฐานข้อมูล (UTC) ไม่มี `updated_at` เพราะตารางนี้เขียนอย่างเดียว',

  'messages.id': 'รหัสข้อความ UUID v4',
  'messages.lead_id': 'lead ที่บทสนทนานี้สังกัด',
  'messages.contact_id': 'ผู้ติดต่อคู่สนทนา',
  'messages.direction': '`inbound` ลูกค้าส่งมา · `outbound` เราส่งไป',
  'messages.channel': 'ช่องทาง ปัจจุบันมีเฉพาะ `line`',
  'messages.content_type':
    'ชนิดเนื้อหา · ที่ไม่ใช่ `text` จะแสดงเป็น placeholder และไม่ถูกส่งให้ AI (A37)',
  'messages.body': 'เนื้อความ · ว่างได้เมื่อเป็นสติกเกอร์หรือรูป',
  'messages.line_message_id':
    'รหัสข้อความฝั่ง LINE ห้ามซ้ำ กันข้อความเดียวกันถูกบันทึกสองครั้ง (A30)',
  'messages.send_status': '`received` สำหรับขาเข้า · ขาออกเดิน `pending` → `sent` หรือ `failed`',
  'messages.attempt_count': 'จำนวนครั้งที่พยายามส่ง สูงสุด 3 (A35)',
  'messages.error_detail': 'สาเหตุที่ส่งไม่สำเร็จ เก็บไว้เพื่อให้ตรวจสอบได้',
  'messages.approved_by': 'ผู้อนุมัติให้ส่ง · **บังคับสำหรับขาออก** ด้วย CHECK constraint (A34)',
  'messages.sent_at': 'เวลาที่ส่งสำเร็จ (UTC)',
  'messages.lead_data_json': 'lead ณ เวลาที่บันทึกข้อความ · บันทึกครั้งเดียวตอนสร้าง',
  'messages.contact_data_json': 'ผู้ติดต่อ ณ เวลาที่บันทึกข้อความ',
  'messages.created_by': 'ผู้สร้างเรคคอร์ด · **ว่าง = ระบบเป็นผู้ทำ** เติมอัตโนมัติจาก `actorId` (A12)',
  'messages.updated_by': 'ผู้แก้ไขล่าสุด · เปลี่ยนเฉพาะเมื่อมีข้อมูลอื่นเปลี่ยนจริง',
  'messages.created_at': 'เวลาที่สร้างเรคคอร์ด (UTC)',
  'messages.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC) เปลี่ยนเมื่อสถานะการส่งเปลี่ยน',

  'ai_suggestions.id': 'รหัสคำแนะนำ UUID v4',
  'ai_suggestions.lead_id': 'lead ที่คำแนะนำนี้เกี่ยวข้อง',
  'ai_suggestions.kind': 'ชนิดคำแนะนำ ปัจจุบันมีชุดเดียวคือ `copilot_bundle`',
  'ai_suggestions.payload':
    'ผลลัพธ์ 4 อย่าง: `summary`, `score` พร้อม `score_reasons`, `next_best_action`, `draft_line_reply` (A23)',
  'ai_suggestions.context_snapshot':
    'สำเนาข้อมูล lead ที่โมเดลเห็นตอนสร้างคำแนะนำ ทำให้ตอบได้ว่าทำไมถึงให้คะแนนเท่านี้ แม้ lead ถูกแก้ไปแล้ว (A17)',
  'ai_suggestions.model': 'ชื่อโมเดลที่ใช้ · ว่างเมื่อผลมาจาก fallback แบบกฎตายตัว',
  'ai_suggestions.prompt_version': 'เวอร์ชันของ prompt ที่ใช้ ทำให้เทียบผลข้ามเวอร์ชันได้',
  'ai_suggestions.degraded':
    'จริงเมื่อ LLM ใช้งานไม่ได้และระบบใช้ตัวให้คะแนนสำรอง · UI ต้องแสดงให้ผู้ใช้เห็น (A25)',
  'ai_suggestions.status':
    '`proposed` ยังไม่มีใครตัดสิน · `approved` หรือ `rejected` ผ่านมือคนแล้ว (A22)',
  'ai_suggestions.requested_by': 'ผู้กดขอคำแนะนำ บังคับ เพราะระบบไม่สร้างเองอัตโนมัติ (A27)',
  'ai_suggestions.decided_by': 'ผู้อนุมัติหรือปฏิเสธ · บังคับเมื่อ `status` ไม่ใช่ `proposed`',
  'ai_suggestions.decided_at': 'เวลาที่ตัดสินใจ (UTC) · บังคับคู่กับ `decided_by`',
  'ai_suggestions.lead_data_json': 'lead ณ เวลาที่สร้างคำแนะนำ · เสริมกับ `context_snapshot` ที่เก็บสิ่งที่โมเดลเห็นจริง',
  'ai_suggestions.created_by': 'ผู้สร้างเรคคอร์ด · **ว่าง = ระบบเป็นผู้ทำ** เติมอัตโนมัติจาก `actorId` (A12)',
  'ai_suggestions.updated_by': 'ผู้แก้ไขล่าสุด · เปลี่ยนเฉพาะเมื่อมีข้อมูลอื่นเปลี่ยนจริง',
  'ai_suggestions.created_at': 'เวลาที่สร้างคำแนะนำ (UTC)',
  'ai_suggestions.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC)',

  'line_webhook_events.webhook_event_id':
    'รหัส event จาก LINE เป็น primary key จึงกันข้อความซ้ำได้ที่ระดับฐานข้อมูล (A30)',
  'line_webhook_events.destination': 'รหัสบัญชี LINE OA ปลายทางที่รับ event',
  'line_webhook_events.event_type': 'ชนิด event จาก LINE เช่น `message`, `follow`, `unfollow`',
  'line_webhook_events.raw_payload':
    'payload ดิบทั้งก้อน บันทึกก่อนประมวลผลเพื่อให้ replay ได้เมื่อ logic พัง (A31)',
  'line_webhook_events.signature_valid':
    'ผลการตรวจลายเซ็น · คำขอที่ไม่ผ่านถูกปฏิเสธด้วย 401 และไม่ถูกบันทึก จึงเป็นจริงเสมอในทางปฏิบัติ',
  'line_webhook_events.process_status':
    'สถานะการประมวลผล ใช้เป็นสัญญาณเฝ้าระวังเรื่องความหน่วง (A42)',
  'line_webhook_events.error_detail': 'สาเหตุที่ประมวลผลไม่สำเร็จ',
  'line_webhook_events.message_id': 'ข้อความที่ถูกสร้างจาก event นี้ ถ้ามี',
  'line_webhook_events.received_at': 'เวลาที่รับ event (UTC)',
  'line_webhook_events.processed_at':
    'เวลาที่ประมวลผลเสร็จ (UTC) บังคับเมื่อ `process_status = processed`',
  'line_webhook_events.created_by': 'ผู้สร้างเรคคอร์ด · **ว่าง = ระบบเป็นผู้ทำ** เติมอัตโนมัติจาก `actorId` (A12)',
  'line_webhook_events.updated_by': 'ผู้แก้ไขล่าสุด · เปลี่ยนเฉพาะเมื่อมีข้อมูลอื่นเปลี่ยนจริง',
  'line_webhook_events.created_at': 'เวลาที่สร้างเรคคอร์ด (UTC)',
  'line_webhook_events.updated_at': 'เวลาที่แก้ไขล่าสุด (UTC)',

  'tbl_audit_history.id': 'รหัสรายการ เรียงตามลำดับการเขียน ใช้ตัดสินลำดับเมื่อเวลาเท่ากัน',
  'tbl_audit_history.table_name': 'ตารางที่ถูกแก้ · เป็น ENUM เพื่อให้ฐานข้อมูลปฏิเสธชื่อตารางที่ไม่ได้ track',
  'tbl_audit_history.entity_id': 'รหัสของเรคคอร์ดที่เปลี่ยน · ไม่ใช้ FK เพราะชี้ไปได้หลายตาราง',

  'tbl_audit_history.action': '`update` แก้ไขปกติ · `soft_delete` ปิดใช้งาน · `restore` เปิดกลับ · แยกออกมาเพื่อให้หน้าจอตรวจสอบกรองการลบได้',
  'tbl_audit_history.old_json': 'ค่าก่อนเปลี่ยน เฉพาะฟิลด์ที่เปลี่ยนจริงและอยู่ใน whitelist',
  'tbl_audit_history.new_json': 'ค่าหลังเปลี่ยน มีชุดคีย์เดียวกับ `old_json`',
  'tbl_audit_history.changed_by': 'ผู้แก้ไข · **ว่าง = ระบบเป็นผู้แก้** ใช้หลักเดียวกับ `activities.actor_id`',
  'tbl_audit_history.changed_at': 'เวลาที่เปลี่ยน (UTC) ความละเอียดระดับมิลลิวินาที เพราะการแก้สองครั้งในวินาทีเดียวกันต้องแยกลำดับออกจากกันได้',
  'tbl_audit_history.created_at': 'เวลาที่บันทึกลงฐานข้อมูล (UTC) ไม่มี `updated_at` เพราะเขียนอย่างเดียว',
};

const CHECKS = {
  chk_audit_actually_changed:
    'ห้ามบันทึกรายการที่ `old_json` กับ `new_json` เหมือนกันทุกประการ — ประวัติที่ไม่มีอะไรเปลี่ยนคือขยะที่ทำให้อ่านยาก',
  chk_leads_triage_requires_no_owner:
    'lead ที่ไม่มีเจ้าของต้องติดธง triage และ lead ที่มีเจ้าของต้องไม่ติดธง — กันไม่ให้มีงานที่ไม่มีใครเห็น',
  chk_activities_stage_change_has_stages:
    'บันทึกการเปลี่ยน stage ต้องมีทั้งต้นทางและปลายทาง มิฉะนั้นไม่ใช่ audit ที่ใช้ได้',
  chk_messages_direction_status:
    'ขาเข้าต้องเป็น `received` เท่านั้น ขาออกเดินได้เฉพาะ `pending` `sent` `failed`',
  chk_messages_outbound_requires_approver:
    'ข้อความขาออกต้องมีผู้อนุมัติ — ไม่มีเส้นทางใดในโปรแกรมส่งข้อความหาลูกค้าโดยไม่ผ่านมือคนได้',
  chk_ai_suggestions_decision_is_attributed:
    'คำแนะนำที่ถูกอนุมัติหรือปฏิเสธต้องระบุว่าใครตัดสินและเมื่อไร ส่วนที่ยังเป็นข้อเสนอต้องไม่มีทั้งสองค่า',
  chk_line_events_processed_has_timestamp:
    'event ที่บอกว่าประมวลผลแล้วต้องมีเวลากำกับ กันไม่ให้งานค้างดูเหมือนเสร็จ',
};

const CLOSING_NOTES = [
  '**ไม่มี `status_id` แบบรวมศูนย์** แต่ละตารางใช้ ENUM ของตัวเอง เพื่อให้ฐานข้อมูลปฏิเสธค่าที่ผิดได้จริง (A13)',
  '**`is_active` มีเฉพาะ `users` `contacts` `companies`** สามตารางนี้ไม่มีการลบถาวร ส่วนตารางบันทึกประวัติไม่มีวันถูกปิดใช้งาน (A14)',
  '**ไม่เก็บ IP address ในตารางธุรกิจ** เพราะเป็นข้อมูลส่วนบุคคลตาม PDPA เก็บเฉพาะเหตุการณ์ยืนยันตัวตนไว้ใน log ที่มีอายุ 90 วัน (A15)',
  '**`created_by` / `updated_by` มีเฉพาะตารางที่มนุษย์แก้ไข** ตารางที่ระบบหรือ AI เป็นผู้เขียนใช้คอลัมน์ที่สื่อความหมายตรงกว่า เช่น `actor_id`, `requested_by` (A12)',
  '**เก็บสำเนาข้อมูล ณ เวลานั้นเพียง 2 จุด** คือ `activities.from_stage`/`to_stage` และ `ai_suggestions.context_snapshot` ที่เหลือ join กับค่าปัจจุบันเสมอ (A17)',
];

module.exports = { TABLE_ORDER, TABLES, COLUMNS, CHECKS, CLOSING_NOTES };
