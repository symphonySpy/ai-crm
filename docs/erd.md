# แผนภาพความสัมพันธ์ (ERD)

สร้างอัตโนมัติจากฐานข้อมูลจริงด้วย `npm run docs:erd` ความสัมพันธ์ที่เห็นคือ foreign key ที่มีอยู่จริง
ไม่ใช่ที่ตั้งใจจะมี ให้สร้างใหม่ทุกครั้งหลังเพิ่ม migration

แผนภาพนี้แสดง**คีย์ สถานะ และคอลัมน์ที่สื่อความหมายทางธุรกิจ** เท่านั้น
คอลัมน์บันทึกเวลา ผู้แก้ไข และ snapshot JSON ถูกซ่อนไว้เพื่อให้อ่านออก
รายการคอลัมน์ทั้งหมดพร้อมคำอธิบายอยู่ใน [data-dictionary.md](data-dictionary.md)

---

## โครงสร้างและความสัมพันธ์

```mermaid
erDiagram
  USERS |o--o{ ACTIVITIES : "created_by"
  LEADS ||--o{ ACTIVITIES : "lead_id"
  USERS |o--o{ ACTIVITIES : "actor_id"
  USERS |o--o{ ACTIVITIES : "updated_by"
  USERS |o--o{ AI_SUGGESTIONS : "created_by"
  LEADS ||--o{ AI_SUGGESTIONS : "lead_id"
  USERS ||--o{ AI_SUGGESTIONS : "requested_by"
  USERS |o--o{ AI_SUGGESTIONS : "decided_by"
  USERS |o--o{ AI_SUGGESTIONS : "updated_by"
  USERS |o--o{ COMPANIES : "created_by"
  USERS |o--o{ COMPANIES : "updated_by"
  COMPANIES |o--o{ CONTACTS : "company_id"
  USERS |o--o{ CONTACTS : "created_by"
  USERS |o--o{ CONTACTS : "updated_by"
  CONTACTS ||--o{ LEADS : "contact_id"
  COMPANIES |o--o{ LEADS : "company_id"
  USERS |o--o{ LEADS : "owner_id"
  USERS |o--o{ LEADS : "created_by"
  USERS |o--o{ LEADS : "updated_by"
  USERS |o--o{ LINE_WEBHOOK_EVENTS : "created_by"
  MESSAGES |o--o{ LINE_WEBHOOK_EVENTS : "message_id"
  USERS |o--o{ LINE_WEBHOOK_EVENTS : "updated_by"
  USERS |o--o{ MESSAGES : "created_by"
  LEADS ||--o{ MESSAGES : "lead_id"
  CONTACTS ||--o{ MESSAGES : "contact_id"
  USERS |o--o{ MESSAGES : "approved_by"
  USERS |o--o{ MESSAGES : "updated_by"
  USERS |o--o{ REST_LOG : "user_id"
  USERS |o--o{ TBL_AUDIT_HISTORY : "changed_by"
  USERS |o--o{ USERS : "created_by"
  USERS |o--o{ USERS : "updated_by"

  USERS {
    uuid id PK
    string email UK
    string name
    enum role
    boolean is_active
  }
  COMPANIES {
    uuid id PK
    string name
    string industry
    boolean is_active
  }
  CONTACTS {
    uuid id PK
    uuid company_id FK
    string name
    string phone
    string email
    string line_user_id UK
    boolean is_active
  }
  LEADS {
    uuid id PK
    uuid contact_id FK
    uuid company_id FK
    uuid owner_id FK
    string title
    enum stage
    int value_thb
    enum source
    boolean needs_triage
    datetime last_contact_at
  }
  ACTIVITIES {
    uuid id PK
    uuid lead_id FK
    uuid actor_id FK
    enum type
    enum from_stage
    enum to_stage
    text note
    datetime occurred_at
  }
  MESSAGES {
    uuid id PK
    uuid lead_id FK
    uuid contact_id FK
    enum direction
    enum content_type
    text body
    string line_message_id UK
    enum send_status
    int attempt_count
    uuid approved_by FK
    datetime sent_at
  }
  AI_SUGGESTIONS {
    uuid id PK
    uuid lead_id FK
    enum kind
    json payload
    json context_snapshot
    boolean degraded
    enum status
    uuid requested_by FK
    uuid decided_by FK
  }
  LINE_WEBHOOK_EVENTS {
    string webhook_event_id PK
    json raw_payload
    enum process_status
    uuid message_id FK
    datetime received_at
  }
  TBL_AUDIT_HISTORY {
    bigint id PK
    enum table_name
    string entity_id
    enum action
    json old_json
    json new_json
    uuid changed_by FK
  }
  REST_LOG {
    bigint id PK
    uuid user_id FK
  }
```

---

## หน้าที่ของแต่ละตาราง

| ตาราง | หน้าที่ |
|---|---|
| `users` | ผู้ใช้งานระบบ คือพนักงานขายและผู้จัดการ ไม่ใช่ลูกค้า |
| `companies` | บริษัทลูกค้า ใช้จัดกลุ่ม contact และ lead |
| `contacts` | บุคคลที่ติดต่อ คือลูกค้าหรือผู้มุ่งหวังตัวจริง |
| `leads` | โอกาสทางการขาย เป็นออบเจ็กต์แกนกลางของทั้งระบบ |
| `activities` | บันทึกเหตุการณ์ทั้งหมดของ lead คือ audit trail ระดับธุรกิจ |
| `messages` | ข้อความสนทนากับลูกค้าทั้งขาเข้าและขาออก |
| `ai_suggestions` | ผลลัพธ์จาก AI copilot ที่ยังไม่ถือเป็นการกระทำจริง |
| `line_webhook_events` | บันทึกดิบของทุก event ที่ LINE ส่งเข้ามา |
| `tbl_audit_history` | ประวัติการแก้ไขและการปิดใช้งานของทุกตารางที่ตรวจสอบ 1 การแก้ = 1 แถว |
| `rest_log` | บันทึกทุกการเรียก API ทั้งขาเข้าและขาออก ใช้ตรวจว่าหน้าจอเรียกเส้นไหนและได้อะไรกลับ |

