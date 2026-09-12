# AI CRM — ระบบ CRM ขนาดเล็กพร้อม AI copilot และ LINE OA

ระบบสาธิตสำหรับโจทย์ **Lead AI Software Engineer** ประกอบด้วยเว็บแอป, REST API,
ฐานข้อมูลเชิงสัมพันธ์, AI skill ที่นำกลับมาใช้ซ้ำได้ และการเชื่อมต่อ LINE Official Account
ข้อมูลทั้งหมดในระบบเป็นข้อมูลสังเคราะห์ ไม่มีข้อมูลลูกค้าจริง

| ส่วน | ที่อยู่ |
|---|---|
| API ที่ติดตั้งแล้ว | https://ai-crm-production-dee4.up.railway.app |
| โค้ด API | [`api/`](api) — Node 22 · Express 4 · Sequelize 6 · MySQL 8 |
| โค้ดเว็บ | [`web/`](web) — Next.js 15 (App Router) · TypeScript |
| AI skill | [`skills/crm-copilot/SKILL.md`](skills/crm-copilot/SKILL.md) |
| เอกสาร | [`docs/`](docs) |

---

## 1. สิ่งที่ระบบทำได้

**CRM** — บริษัท / ผู้ติดต่อ / lead / กิจกรรม / ข้อความ
pipeline 5 ขั้น (New → Qualified → Proposal → Won → Lost) ค้นหา กรอง แบ่งหน้า
มอบหมายเจ้าของ และคิวรอคัดกรองสำหรับ lead ที่ยังไม่มีคนดูแล

**LINE OA** — ข้อความที่ลูกค้าทักเข้ามาสร้างผู้ติดต่อและ lead ให้อัตโนมัติ
แล้วปรากฏในหน้าสนทนาเดียวกับที่พนักงานขายตอบกลับ การตอบกลับทุกครั้งต้องมีคนกดอนุมัติ

**AI copilot** — เรียกเมื่อผู้ใช้กดขอเท่านั้น ให้คะแนนคุณภาพ lead 0–100
พร้อมเหตุผล 5 ข้อที่บวกกันได้เท่าคะแนน สรุปบทสนทนา เสนอขั้นตอนถัดไป
และร่างข้อความตอบกลับ — ทั้งหมดเป็น **ข้อเสนอ** จนกว่าจะมีคนอนุมัติ

---

## 2. รันในเครื่อง

ต้องมี Node 20 ขึ้นไป และ Docker

```bash
git clone https://github.com/symphonySpy/ai-crm.git
cd ai-crm
docker compose up -d          # MySQL 8 ที่พอร์ต 3307 + สร้าง ai_crm_test ให้ด้วย
```

### API

```bash
cd api
cp .env.example .env          # ค่าเริ่มต้นตรงกับ docker-compose.yml อยู่แล้ว
npm install
npm run db:migrate
npm run db:seed               # ข้อมูลสาธิต 10 ผู้ใช้ · ~390 บริษัท · ~1,900 ผู้ติดต่อ · 300 lead
npm run dev                   # http://localhost:4000
```

`SESSION_SECRET` ใน `.env` ต้องตั้งเป็นค่าสุ่มของตัวเองก่อนใช้งาน
(`openssl rand -base64 48`) ไฟล์ `.env.example` มีแต่ค่าตัวอย่าง ไม่มีความลับจริง

ค่าเริ่มต้นคือ `LINE_ADAPTER=mock` และ `AI_ADAPTER=mock` ระบบจึงรันได้ครบทุกหน้าจอ
โดยไม่ต้องมีบัญชี LINE หรือ API key ของผู้ให้บริการ AI

### เว็บ

```bash
cd web
cp .env.example .env.local    # API_BASE_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:3000
```

### บัญชีสาธิต

seeder สร้างบัญชี manager 1 บัญชี และ sales 9 บัญชี **รหัสผ่านไม่ได้อยู่ในโค้ดหรือใน git**

```bash
SEED_PASSWORD='ตั้งเอง' npm run db:seed   # กำหนดเอง
npm run db:seed                           # หรือปล่อยให้สุ่ม แล้วพิมพ์ออกมาครั้งเดียว
```

อีเมลและรหัสผ่านสำหรับเข้าระบบที่ติดตั้งไว้แล้ว **ส่งแยกต่างหากทางอีเมล** ไม่อยู่ในที่เก็บโค้ดนี้

รหัสผ่านที่คอมมิตลง repo คือรหัสผ่านที่ยังใช้ได้อีกนานหลังจาก repo เลิกเป็นของส่วนตัว
และเหตุผลว่า "ก็แค่ข้อมูลสาธิต" คือที่มาของ credential ส่วนใหญ่ที่หลุดอยู่ใน public history

---

## 3. เทส

```bash
cd api
npm run test:db               # migrate ฐานข้อมูล ai_crm_test (ครั้งแรกครั้งเดียว)
npm test                      # 16 เทส / 3 ไฟล์
npm run test:skill            # eval ของ AI skill — 6 เคส 27 ข้อตรวจ
```

เทสรันกับ MySQL จริง ไม่ใช่ของปลอม เพราะสิ่งที่ตรวจ — CHECK constraint,
primary key ที่ทำหน้าที่กัน webhook ซ้ำ, แถว audit ที่เขียนโดย hook — อยู่ในฐานข้อมูลเอง
ของปลอมจะผ่านทั้งที่ของจริงพัง ทุกเทสสร้างข้อมูลของตัวเองแล้วลบทิ้ง จึงรันซ้ำได้

| ไฟล์ | ครอบคลุม |
|---|---|
| [`api/test/lead-flow.test.js`](api/test/lead-flow.test.js) | flow หลักของ CRM: สร้าง lead → มอบหมาย → เปลี่ยนขั้น → บันทึกโน้ต พร้อมตรวจ timeline, คอลัมน์ผู้แก้ไข, แถว audit และการกัน mass assignment |
| [`api/test/line-webhook.test.js`](api/test/line-webhook.test.js) | ความปลอดภัยของ webhook (ไม่มีลายเซ็น / ลายเซ็นผิด / ลายเซ็นจาก payload อื่น → 401 และไม่เขียนอะไรเลย) และ idempotency (ส่งซ้ำ `webhookEventId` เดิมไม่สร้าง lead ที่สอง) |
| [`api/test/ai-fallback.test.js`](api/test/ai-fallback.test.js) | เมื่อผู้ให้บริการ AI ล่ม หรือคืนค่าที่ตัวเลขไม่สอดคล้องกันเอง ระบบยังตอบได้ด้วยกติกาสำรอง ทำเครื่องหมาย `degraded` และไม่ส่งอะไรถึงลูกค้า |

---

## 4. เอกสาร

| เอกสาร | เนื้อหา |
|---|---|
| [`docs/assumptions.md`](docs/assumptions.md) | สมมติฐาน 45 ข้อ (A1–A45) รวมสิ่งที่เลือกไม่ทำและความเสี่ยงที่รับไว้ |
| [`docs/erd.md`](docs/erd.md) | ER diagram (สร้างจาก model จริง) |
| [`docs/data-dictionary.md`](docs/data-dictionary.md) | พจนานุกรมข้อมูลทุกตารางทุกคอลัมน์ (สร้างจาก model จริง) |
| [`docs/api-notes.md`](docs/api-notes.md) | รูปแบบคำตอบ รหัสข้อผิดพลาด การยืนยันตัวตน CORS และ endpoint ทั้งหมด |
| [`docs/line-integration.md`](docs/line-integration.md) | การตั้งค่า LINE OA, การตรวจลายเซ็น, idempotency, การอนุมัติก่อนส่ง |
| [`docs/deploy.md`](docs/deploy.md) | ขั้นตอนติดตั้งบน Railway และตัวแปรสภาพแวดล้อม |
| [`docs/ai-usage-log.md`](docs/ai-usage-log.md) | บันทึกการใช้ AI ในการพัฒนา รวม 8 กรณีที่ผลลัพธ์จาก AI ถูกปฏิเสธหรือแก้ |
| [`skills/crm-copilot/SKILL.md`](skills/crm-copilot/SKILL.md) | สัญญาของ AI skill: input, output, สิ่งที่ทำได้/ทำไม่ได้, พฤติกรรมเมื่อล้มเหลว, eval |

เอกสารสองฉบับสร้างจากโค้ดโดยตรง (`npm run docs` ใน `api/`) จึงไม่มีทางคลาดจาก schema จริง

---

## 5. การตัดสินใจที่สำคัญ

**ฐานข้อมูลบังคับกฎเอง ไม่ฝากไว้กับโค้ด** — มี CHECK constraint 8 ตัว เช่น lead ที่มีเจ้าของ
แล้วจะอยู่ในคิวรอคัดกรองไม่ได้, ข้อความขาออกที่ส่งแล้วต้องมีผู้อนุมัติ, การเปลี่ยนขั้นต้องบันทึกว่า
มาจากขั้นไหน กฎพวกนี้เขียนซ้ำในโค้ดได้ แต่โค้ดมีหลายทางเข้า (route, seeder, script, migration
ในอนาคต) ส่วนฐานข้อมูลมีทางเดียว

**AI เสนอ คนตัดสิน** — `ai_suggestions` เขียนได้แค่สถานะ `proposed` ไม่มีเส้นทางใดใน
ระบบที่ทำให้ข้อความจาก AI ถึงลูกค้าได้โดยไม่มี `approved_by` และข้อจำกัดนี้อยู่ใน constraint
ไม่ใช่แค่ใน if

**บันทึกสภาพ ณ เวลานั้น** — ตารางที่อ้างอิง master เก็บ JSON snapshot ไว้ด้วย
(`leads.contact_data_json` ฯลฯ) เพราะคำถามว่า "ตอนมอบหมาย lead นี้ บริษัทชื่ออะไร"
ตอบไม่ได้ถ้าเก็บแต่ id และทุก update/soft delete ถูกบันทึกลง `tbl_audit_history`
พร้อม `old_json` / `new_json`

**ตรวจลายเซ็น LINE จากไบต์ดิบ** — เทียบแบบ constant time และ mount route นี้ก่อน
`express.json` ถ้า parse ก่อนแล้ว serialize ใหม่ ลายเซ็นจะไม่มีวันตรงกัน และ "วิธีแก้"
ที่เย้ายวนคือปิดการตรวจ ซึ่งเปิดให้ใครก็ได้เขียนข้อมูลเข้าระบบ

**Adapter ที่ปลอดภัยโดยปริยาย** — ทั้ง LINE และ AI จะเรียกของจริงก็ต่อเมื่อตั้งค่าเป็น
`live` อย่างชัดเจน ค่าเริ่มต้นคือ mock เพื่อไม่ให้เครื่อง dev ส่งข้อความถึงลูกค้าจริงโดยไม่ตั้งใจ

---

## 6. ข้อจำกัดที่รู้ตัว

- **Session เป็น stateless cookie** ยกเลิก session กลางคันไม่ได้ ต้องรอหมดอายุ 12 ชั่วโมง
  งานจริงที่มีข้อมูลลูกค้าควรเก็บ session ฝั่ง server
- **สิทธิ์ยังหยาบ** มีแค่ `manager` กับ `sales` และแยกกันเฉพาะจุดที่พลาดแล้วถึงลูกค้า
- **ไม่มี realtime** หน้าเว็บโหลดข้อมูลตอนเปิด ยังไม่มี websocket
- **ค้นหาใช้ `LIKE`** พอสำหรับข้อมูลระดับนี้ แต่ไม่เหมาะกับหลายแสนแถว
- **AI copilot ทำงานกับข้อความภาษาไทยเป็นหลัก** และคะแนนเป็นการจัดลำดับความสำคัญ
  ไม่ใช่การพยากรณ์โอกาสปิดการขาย
- **การส่งออก LINE ยังไม่มี queue** มี retry 3 ครั้งแบบ exponential backoff และ
  `npm run messages:retry` สำหรับกวาดของค้าง

## 7. สัญญาณที่ควรเฝ้าระวัง (A43)

ระบบเฝ้าระวังยังไม่ได้ติดตั้งจริงในกรอบเวลานี้ แต่สัญญาณที่ควรตั้งการแจ้งเตือนคือ

| สัญญาณ | อ่านจาก | ทำไมต้องดู |
|---|---|---|
| อัตรา 401 ของ `/webhooks/line` | log ของ webhook | พุ่งขึ้นแปลว่า channel secret ไม่ตรงกันหลัง rotate หรือมีคนกำลังยิงเข้ามา |
| ความหน่วงในการประมวลผล webhook | `line_webhook_events.received_at` เทียบ `processed_at` | LINE ส่งซ้ำเมื่อช้า ความหน่วงที่โตขึ้นคือสัญญาณล่วงหน้าของงานซ้ำ |
| อัตรา `degraded = true` | `ai_suggestions` | คำแนะนำที่มาจากกติกาสำรองแทนที่จะมาจากโมเดล ถ้าค้างสูงแปลว่าผู้ให้บริการมีปัญหาหรือ prompt พัง |
| ข้อความค้างสถานะ `pending` | `messages.send_status` | ข้อความที่พนักงานอนุมัติแล้วแต่ยังไม่ถึงลูกค้า |
| อัตราส่งข้อความล้มเหลว | `messages.send_status = failed` | token หมดอายุหรือถูกจำกัดอัตราจากฝั่ง LINE |
| อัตรา 5xx และเวลาตอบสนอง | `rest_log` | ภาพรวมสุขภาพ API โดยไม่ต้องพึ่งเครื่องมือภายนอก |

ปลายทางที่เหมาะสมคือช่องแจ้งเตือนของทีม (LINE Notify หรือ Slack) สำหรับสัญญาณสองอันแรก
และแดชบอร์ดรายวันสำหรับที่เหลือ

## 8. ถ้าจะขึ้นใช้งานจริงต่อจากนี้

1. ย้าย session ไปเก็บฝั่ง server เพื่อให้สั่ง logout ทุกอุปกรณ์ได้
2. ใส่ job queue ให้การส่ง LINE และการเรียก AI แยกจาก request ของผู้ใช้
3. เพิ่มสิทธิ์ระดับทีม/ภูมิภาค แทนที่จะเห็น pipeline ทั้งบริษัททุกคน
4. ต่อ metric และ alert กับ `rest_log` และสถานะ `degraded` ของ AI
5. ทำ data retention ให้ `rest_log` และ `tbl_audit_history` อัตโนมัติ (ตอนนี้เป็นสคริปต์)
6. ประเมิน AI copilot ด้วยข้อมูลจริงแทน eval สังเคราะห์ ก่อนให้พนักงานเชื่อคะแนน
