# พจนานุกรมข้อมูล (Data dictionary)

เอกสารนี้ **สร้างอัตโนมัติจากฐานข้อมูลจริง** ด้วย `npm run docs:datadict` ไม่ได้พิมพ์ด้วยมือ
จึงไม่มีทางคลาดเคลื่อนจาก schema ที่รันอยู่ ให้สร้างใหม่ทุกครั้งหลังเพิ่ม migration

MySQL 8.0 · charset `utf8mb4` · collation `utf8mb4_unicode_ci` · เวลาทั้งหมดเก็บเป็น UTC (A10)
รหัส `A##` ในคำอธิบายอ้างถึงสมมติฐานใน [assumptions.md](assumptions.md)

---

## สรุปตาราง

| ตาราง | หน้าที่ | จำนวนแถว (ข้อมูลสาธิต) | คอลัมน์ |
|---|---|---:|---:|
| `users` | ผู้ใช้งานระบบ คือพนักงานขายและผู้จัดการ ไม่ใช่ลูกค้า | 10 | 8 |
| `companies` | บริษัทลูกค้า ใช้จัดกลุ่ม contact และ lead | 400 | 8 |
| `contacts` | บุคคลที่ติดต่อ คือลูกค้าหรือผู้มุ่งหวังตัวจริง | 2,000 | 12 |
| `leads` | โอกาสทางการขาย เป็นออบเจ็กต์แกนกลางของทั้งระบบ | 300 | 14 |
| `activities` | บันทึกเหตุการณ์ทั้งหมดของ lead คือ audit trail ระดับธุรกิจ | 1,306 | 9 |
| `messages` | ข้อความสนทนากับลูกค้าทั้งขาเข้าและขาออก | 392 | 15 |
| `ai_suggestions` | ผลลัพธ์จาก AI copilot ที่ยังไม่ถือเป็นการกระทำจริง | 76 | 14 |
| `line_webhook_events` | บันทึกดิบของทุก event ที่ LINE ส่งเข้ามา | 238 | 12 |

---

## `users`

ผู้ใช้งานระบบ คือพนักงานขายและผู้จัดการ ไม่ใช่ลูกค้า

> ไม่มีการลบถาวร (A14) เพราะ `leads.owner_id` และ `activities.actor_id` อ้างถึงอยู่ พนักงานที่ลาออกให้ตั้ง `is_active = 0` แล้วโอน lead ให้คนอื่น

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัสผู้ใช้ UUID v4 |
| `email` | varchar(255) | — |  | UK | อีเมลที่ใช้เข้าสู่ระบบ ห้ามซ้ำ |
| `password_hash` | varchar(255) | — |  |  | รหัสผ่านที่ผ่าน bcrypt แล้ว ไม่เคยถูกส่งออกทาง API เพราะโมเดลตัดออกด้วย defaultScope |
| `name` | varchar(120) | — |  |  | ชื่อที่แสดงในระบบ |
| `role` | enum: `sales` · `manager` | — | `sales` |  | `sales` เห็น lead ทั้งหมดแต่ส่งข้อความได้เฉพาะ lead ตัวเอง · `manager` ทำได้ทั้งหมด (A3) |
| `is_active` | tinyint(1) | — | `1` |  | พนักงานที่ยังทำงานอยู่หรือไม่ ใช้แทนการลบ (A14) |
| `created_at` | datetime | — |  |  | เวลาที่สร้างเรคคอร์ด (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) |

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `email` | `email` | ✓ |
| `idx_users_is_active` | `is_active` | — |

---

## `companies`

บริษัทลูกค้า ใช้จัดกลุ่ม contact และ lead

> ไม่บังคับ — lead จากช่องทาง LINE มักยังไม่รู้ว่าลูกค้าสังกัดบริษัทใด

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัสบริษัท UUID v4 |
| `name` | varchar(200) | — |  |  | ชื่อบริษัทลูกค้า |
| `industry` | varchar(100) | ✓ |  |  | กลุ่มอุตสาหกรรม ใช้จัดกลุ่มและกรอง |
| `is_active` | tinyint(1) | — | `1` |  | บริษัทที่ยังดำเนินกิจการอยู่หรือไม่ |
| `created_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้สร้างเรคคอร์ด (A12) |
| `updated_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้แก้ไขล่าสุด |
| `created_at` | datetime | — |  |  | เวลาที่สร้างเรคคอร์ด (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) |

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `created_by` | `created_by` | — |
| `idx_companies_is_active` | `is_active` | — |
| `idx_companies_name` | `name` | — |
| `updated_by` | `updated_by` | — |

---

## `contacts`

บุคคลที่ติดต่อ คือลูกค้าหรือผู้มุ่งหวังตัวจริง

> `line_user_id` เป็น unique และเป็นกุญแจที่ใช้จับคู่ข้อความ LINE ขาเข้ากลับมาหา contact (A32)

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัสผู้ติดต่อ UUID v4 |
| `company_id` | char(36) (UUID) | ✓ |  | FK → `companies.id` (del: SET NULL) | บริษัทที่สังกัด ไม่บังคับ |
| `name` | varchar(160) | — |  |  | ชื่อผู้ติดต่อ ถ้ามนุษย์แก้แล้วถือเป็นชื่อหลัก (A33) |
| `phone` | varchar(32) | ✓ |  |  | เบอร์โทรศัพท์ |
| `email` | varchar(255) | ✓ |  |  | อีเมลผู้ติดต่อ |
| `line_user_id` | varchar(64) | ✓ |  | UK | รหัสผู้ใช้ LINE ห้ามซ้ำ เป็นกุญแจจับคู่ข้อความขาเข้า (A32) |
| `line_display_name` | varchar(160) | ✓ |  |  | ชื่อที่แสดงบนโปรไฟล์ LINE ตอนติดต่อครั้งแรก ไม่ใช่ชื่อหลัก (A33) |
| `is_active` | tinyint(1) | — | `1` |  | ผู้ติดต่อที่ยังใช้งานอยู่หรือไม่ ใช้แทนการลบ |
| `created_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้สร้างเรคคอร์ด · ว่างเมื่อระบบสร้างจากข้อความ LINE |
| `updated_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้แก้ไขล่าสุด |
| `created_at` | datetime | — |  |  | เวลาที่สร้างเรคคอร์ด (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) |

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `created_by` | `created_by` | — |
| `idx_contacts_company` | `company_id` | — |
| `idx_contacts_is_active` | `is_active` | — |
| `idx_contacts_name` | `name` | — |
| `line_user_id` | `line_user_id` | ✓ |
| `updated_by` | `updated_by` | — |

---

## `leads`

โอกาสทางการขาย เป็นออบเจ็กต์แกนกลางของทั้งระบบ

> ไม่แยกตาราง deal — lead ถือ `stage` และ `value_thb` ในตัว (A6) และไม่มี `is_active` เพราะ stage `Lost` ทำหน้าที่สถานะปลายทางแล้ว

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัส lead UUID v4 |
| `contact_id` | char(36) (UUID) | — |  | FK → `contacts.id` (del: RESTRICT) | ผู้ติดต่อหลักของ lead นี้ บังคับ |
| `company_id` | char(36) (UUID) | ✓ |  | FK → `companies.id` (del: SET NULL) | บริษัทที่เกี่ยวข้อง ไม่บังคับ |
| `owner_id` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: RESTRICT) | พนักงานขายเจ้าของ lead · ว่างได้เฉพาะเมื่อ `needs_triage = 1` |
| `title` | varchar(200) | — |  |  | หัวข้อหรือความต้องการของลูกค้าโดยย่อ |
| `stage` | enum: `New` · `Qualified` · `Proposal` · `Won` · `Lost` | — | `New` |  | ขั้นใน pipeline ย้ายได้ทุกทิศทางรวมถึงถอยหลัง ทุกครั้งบันทึกลง activities (A19) |
| `value_thb` | int unsigned | — | `0` |  | มูลค่าดีลเป็นบาทเต็มจำนวน ชนิด UNSIGNED ฐานข้อมูลจึงปฏิเสธค่าติดลบ (A9) |
| `source` | enum: `website` · `manual` · `line` | — | `manual` |  | ช่องทางที่ lead เข้ามา |
| `needs_triage` | tinyint(1) | — | `0` |  | รอมอบหมายเจ้าของ ตั้งอัตโนมัติเมื่อระบบสร้าง lead จาก LINE ที่ยังไม่รู้จักผู้ส่ง (A32) |
| `last_contact_at` | datetime | ✓ |  |  | เวลาที่มีการติดต่อล่าสุด ใช้เป็นเกณฑ์หนึ่งในการให้คะแนน |
| `created_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้สร้างเรคคอร์ด · ว่างเมื่อระบบสร้างจาก LINE |
| `updated_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้แก้ไขล่าสุด |
| `created_at` | datetime | — |  |  | เวลาที่สร้างเรคคอร์ด (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) |

**CHECK constraints**

- `chk_leads_triage_requires_no_owner` — lead ที่ไม่มีเจ้าของต้องติดธง triage และ lead ที่มีเจ้าของต้องไม่ติดธง — กันไม่ให้มีงานที่ไม่มีใครเห็น
  ```sql
  (((`owner_id` is null) and (`needs_triage` = 1)) or ((`owner_id` is not null) and (`needs_triage` = 0)))
  ```

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `company_id` | `company_id` | — |
| `created_by` | `created_by` | — |
| `idx_leads_contact` | `contact_id` | — |
| `idx_leads_needs_triage` | `needs_triage` | — |
| `idx_leads_owner` | `owner_id` | — |
| `idx_leads_owner_stage_created` | `owner_id`, `stage`, `created_at` | — |
| `idx_leads_stage` | `stage` | — |
| `updated_by` | `updated_by` | — |

---

## `activities`

บันทึกเหตุการณ์ทั้งหมดของ lead คือ audit trail ระดับธุรกิจ

> เขียนอย่างเดียว ไม่มีการแก้หรือลบ จึงไม่มี `updated_at` (A16) ข้อมูล stage เก็บเป็นค่าไม่ใช่ FK เพื่อให้ประวัติเก่าอ่านออกแม้ pipeline เปลี่ยนชื่อ (A17)

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัสเหตุการณ์ UUID v4 |
| `lead_id` | char(36) (UUID) | — |  | FK → `leads.id` (del: CASCADE) | lead ที่เหตุการณ์นี้เกิดขึ้น |
| `actor_id` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: SET NULL) | ผู้กระทำ · **ว่าง = ระบบเป็นผู้กระทำ** เช่นข้อความ LINE ขาเข้าหรือ lead ที่สร้างอัตโนมัติ |
| `type` | enum: `lead_created` · `stage_changed` · `owner_changed` · `note_added` · `message_received` · `message_sent` · `ai_suggestion_requested` · `ai_suggestion_approved` · `ai_suggestion_rejected` · `contact_updated` | — |  |  | ประเภทเหตุการณ์ |
| `from_stage` | enum: `New` · `Qualified` · `Proposal` · `Won` · `Lost` | ✓ |  |  | stage ต้นทาง บังคับเมื่อ `type = stage_changed` · เก็บเป็นค่าไม่ใช่ FK (A17) |
| `to_stage` | enum: `New` · `Qualified` · `Proposal` · `Won` · `Lost` | ✓ |  |  | stage ปลายทาง บังคับเมื่อ `type = stage_changed` |
| `note` | text | ✓ |  |  | บันทึกข้อความของพนักงานขาย |
| `occurred_at` | datetime | — |  |  | เวลาที่เหตุการณ์เกิดขึ้นจริง (UTC) ใช้เรียง timeline |
| `created_at` | datetime | — |  |  | เวลาที่บันทึกลงฐานข้อมูล (UTC) ไม่มี `updated_at` เพราะตารางนี้เขียนอย่างเดียว |

**CHECK constraints**

- `chk_activities_stage_change_has_stages` — บันทึกการเปลี่ยน stage ต้องมีทั้งต้นทางและปลายทาง มิฉะนั้นไม่ใช่ audit ที่ใช้ได้
  ```sql
  ((`type` <> 'stage_changed') or ((`from_stage` is not null) and (`to_stage` is not null)))
  ```

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `idx_activities_actor` | `actor_id` | — |
| `idx_activities_lead_occurred` | `lead_id`, `occurred_at` | — |

---

## `messages`

ข้อความสนทนากับลูกค้าทั้งขาเข้าและขาออก

> ขาออกต้องมีผู้อนุมัติเสมอ บังคับด้วย CHECK constraint ไม่ใช่แค่กฎในโค้ด (A34)

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัสข้อความ UUID v4 |
| `lead_id` | char(36) (UUID) | — |  | FK → `leads.id` (del: CASCADE) | lead ที่บทสนทนานี้สังกัด |
| `contact_id` | char(36) (UUID) | — |  | FK → `contacts.id` (del: RESTRICT) | ผู้ติดต่อคู่สนทนา |
| `direction` | enum: `inbound` · `outbound` | — |  |  | `inbound` ลูกค้าส่งมา · `outbound` เราส่งไป |
| `channel` | varchar(20) | — | `line` |  | ช่องทาง ปัจจุบันมีเฉพาะ `line` |
| `content_type` | enum: `text` · `sticker` · `image` · `video` · `audio` · `file` · `location` · `other` | — | `text` |  | ชนิดเนื้อหา · ที่ไม่ใช่ `text` จะแสดงเป็น placeholder และไม่ถูกส่งให้ AI (A37) |
| `body` | text | ✓ |  |  | เนื้อความ · ว่างได้เมื่อเป็นสติกเกอร์หรือรูป |
| `line_message_id` | varchar(64) | ✓ |  | UK | รหัสข้อความฝั่ง LINE ห้ามซ้ำ กันข้อความเดียวกันถูกบันทึกสองครั้ง (A30) |
| `send_status` | enum: `received` · `pending` · `sent` · `failed` | — |  |  | `received` สำหรับขาเข้า · ขาออกเดิน `pending` → `sent` หรือ `failed` |
| `attempt_count` | tinyint unsigned | — | `0` |  | จำนวนครั้งที่พยายามส่ง สูงสุด 3 (A35) |
| `error_detail` | text | ✓ |  |  | สาเหตุที่ส่งไม่สำเร็จ เก็บไว้เพื่อให้ตรวจสอบได้ |
| `approved_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: RESTRICT) | ผู้อนุมัติให้ส่ง · **บังคับสำหรับขาออก** ด้วย CHECK constraint (A34) |
| `sent_at` | datetime | ✓ |  |  | เวลาที่ส่งสำเร็จ (UTC) |
| `created_at` | datetime | — |  |  | เวลาที่สร้างเรคคอร์ด (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) เปลี่ยนเมื่อสถานะการส่งเปลี่ยน |

**CHECK constraints**

- `chk_messages_direction_status` — ขาเข้าต้องเป็น `received` เท่านั้น ขาออกเดินได้เฉพาะ `pending` `sent` `failed`
  ```sql
  (((`direction` = 'inbound') and (`send_status` = 'received')) or ((`direction` = 'outbound') and (`send_status` in ('pending','sent','failed'))))
  ```
- `chk_messages_outbound_requires_approver` — ข้อความขาออกต้องมีผู้อนุมัติ — ไม่มีเส้นทางใดในโปรแกรมส่งข้อความหาลูกค้าโดยไม่ผ่านมือคนได้
  ```sql
  ((`direction` = 'inbound') or (`approved_by` is not null))
  ```

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `approved_by` | `approved_by` | — |
| `idx_messages_contact` | `contact_id` | — |
| `idx_messages_lead_created` | `lead_id`, `created_at` | — |
| `idx_messages_status_created` | `send_status`, `created_at` | — |
| `line_message_id` | `line_message_id` | ✓ |

---

## `ai_suggestions`

ผลลัพธ์จาก AI copilot ที่ยังไม่ถือเป็นการกระทำจริง

> เป็นเส้นแบ่งหลักของระบบ (A22) AI เขียนได้เฉพาะตารางนี้ จะแก้ lead หรือส่งข้อความออกได้ต่อเมื่อมีคนเปลี่ยน `status` เท่านั้น

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `id` | char(36) (UUID) | — |  | PK | รหัสคำแนะนำ UUID v4 |
| `lead_id` | char(36) (UUID) | — |  | FK → `leads.id` (del: CASCADE) | lead ที่คำแนะนำนี้เกี่ยวข้อง |
| `kind` | enum: `copilot_bundle` | — | `copilot_bundle` |  | ชนิดคำแนะนำ ปัจจุบันมีชุดเดียวคือ `copilot_bundle` |
| `payload` | json | — |  |  | ผลลัพธ์ 4 อย่าง: `summary`, `score` พร้อม `score_reasons`, `next_best_action`, `draft_line_reply` (A23) |
| `context_snapshot` | json | — |  |  | สำเนาข้อมูล lead ที่โมเดลเห็นตอนสร้างคำแนะนำ ทำให้ตอบได้ว่าทำไมถึงให้คะแนนเท่านี้ แม้ lead ถูกแก้ไปแล้ว (A17) |
| `model` | varchar(80) | ✓ |  |  | ชื่อโมเดลที่ใช้ · ว่างเมื่อผลมาจาก fallback แบบกฎตายตัว |
| `prompt_version` | varchar(20) | — | `v1` |  | เวอร์ชันของ prompt ที่ใช้ ทำให้เทียบผลข้ามเวอร์ชันได้ |
| `degraded` | tinyint(1) | — | `0` |  | จริงเมื่อ LLM ใช้งานไม่ได้และระบบใช้ตัวให้คะแนนสำรอง · UI ต้องแสดงให้ผู้ใช้เห็น (A25) |
| `status` | enum: `proposed` · `approved` · `rejected` | — | `proposed` |  | `proposed` ยังไม่มีใครตัดสิน · `approved` หรือ `rejected` ผ่านมือคนแล้ว (A22) |
| `requested_by` | char(36) (UUID) | — |  | FK → `users.id` (del: RESTRICT) | ผู้กดขอคำแนะนำ บังคับ เพราะระบบไม่สร้างเองอัตโนมัติ (A27) |
| `decided_by` | char(36) (UUID) | ✓ |  | FK → `users.id` (del: RESTRICT) | ผู้อนุมัติหรือปฏิเสธ · บังคับเมื่อ `status` ไม่ใช่ `proposed` |
| `decided_at` | datetime | ✓ |  |  | เวลาที่ตัดสินใจ (UTC) · บังคับคู่กับ `decided_by` |
| `created_at` | datetime | — |  |  | เวลาที่สร้างคำแนะนำ (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) |

**CHECK constraints**

- `chk_ai_suggestions_decision_is_attributed` — คำแนะนำที่ถูกอนุมัติหรือปฏิเสธต้องระบุว่าใครตัดสินและเมื่อไร ส่วนที่ยังเป็นข้อเสนอต้องไม่มีทั้งสองค่า
  ```sql
  (((`status` = 'proposed') and (`decided_by` is null) and (`decided_at` is null)) or ((`status` <> 'proposed') and (`decided_by` is not null) and (`decided_at` is not null)))
  ```

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `decided_by` | `decided_by` | — |
| `idx_ai_suggestions_lead_created` | `lead_id`, `created_at` | — |
| `idx_ai_suggestions_status` | `status` | — |
| `requested_by` | `requested_by` | — |

---

## `line_webhook_events`

บันทึกดิบของทุก event ที่ LINE ส่งเข้ามา

> `webhook_event_id` เป็น primary key จึงเป็นกลไกกันข้อความซ้ำในตัว (A30) และเก็บ payload ดิบก่อนประมวลผลเพื่อให้ replay ได้ (A31)

| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |
|---|---|:---:|---|---|---|
| `webhook_event_id` | varchar(64) | — |  | PK | รหัส event จาก LINE เป็น primary key จึงกันข้อความซ้ำได้ที่ระดับฐานข้อมูล (A30) |
| `destination` | varchar(64) | ✓ |  |  | รหัสบัญชี LINE OA ปลายทางที่รับ event |
| `event_type` | varchar(40) | ✓ |  |  | ชนิด event จาก LINE เช่น `message`, `follow`, `unfollow` |
| `raw_payload` | json | — |  |  | payload ดิบทั้งก้อน บันทึกก่อนประมวลผลเพื่อให้ replay ได้เมื่อ logic พัง (A31) |
| `signature_valid` | tinyint(1) | — | `1` |  | ผลการตรวจลายเซ็น · คำขอที่ไม่ผ่านถูกปฏิเสธด้วย 401 และไม่ถูกบันทึก จึงเป็นจริงเสมอในทางปฏิบัติ |
| `process_status` | enum: `received` · `processed` · `ignored` · `failed` | — | `received` |  | สถานะการประมวลผล ใช้เป็นสัญญาณเฝ้าระวังเรื่องความหน่วง (A42) |
| `error_detail` | text | ✓ |  |  | สาเหตุที่ประมวลผลไม่สำเร็จ |
| `message_id` | char(36) (UUID) | ✓ |  | FK → `messages.id` (del: SET NULL) | ข้อความที่ถูกสร้างจาก event นี้ ถ้ามี |
| `received_at` | datetime | — |  |  | เวลาที่รับ event (UTC) |
| `processed_at` | datetime | ✓ |  |  | เวลาที่ประมวลผลเสร็จ (UTC) บังคับเมื่อ `process_status = processed` |
| `created_at` | datetime | — |  |  | เวลาที่สร้างเรคคอร์ด (UTC) |
| `updated_at` | datetime | — |  |  | เวลาที่แก้ไขล่าสุด (UTC) |

**CHECK constraints**

- `chk_line_events_processed_has_timestamp` — event ที่บอกว่าประมวลผลแล้วต้องมีเวลากำกับ กันไม่ให้งานค้างดูเหมือนเสร็จ
  ```sql
  ((`process_status` <> 'processed') or (`processed_at` is not null))
  ```

**ดัชนี**

| ชื่อ | คอลัมน์ | unique |
|---|---|:---:|
| `idx_line_events_message` | `message_id` | — |
| `idx_line_events_status_received` | `process_status`, `received_at` | — |

---

## หมายเหตุการออกแบบที่ควรทราบ

- **ไม่มี `status_id` แบบรวมศูนย์** แต่ละตารางใช้ ENUM ของตัวเอง เพื่อให้ฐานข้อมูลปฏิเสธค่าที่ผิดได้จริง (A13)
- **`is_active` มีเฉพาะ `users` `contacts` `companies`** สามตารางนี้ไม่มีการลบถาวร ส่วนตารางบันทึกประวัติไม่มีวันถูกปิดใช้งาน (A14)
- **ไม่เก็บ IP address ในตารางธุรกิจ** เพราะเป็นข้อมูลส่วนบุคคลตาม PDPA เก็บเฉพาะเหตุการณ์ยืนยันตัวตนไว้ใน log ที่มีอายุ 90 วัน (A15)
- **`created_by` / `updated_by` มีเฉพาะตารางที่มนุษย์แก้ไข** ตารางที่ระบบหรือ AI เป็นผู้เขียนใช้คอลัมน์ที่สื่อความหมายตรงกว่า เช่น `actor_id`, `requested_by` (A12)
- **เก็บสำเนาข้อมูล ณ เวลานั้นเพียง 2 จุด** คือ `activities.from_stage`/`to_stage` และ `ai_suggestions.context_snapshot` ที่เหลือ join กับค่าปัจจุบันเสมอ (A17)

