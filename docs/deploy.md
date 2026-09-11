# การติดตั้งขึ้น Railway

เอกสารนี้อธิบายการนำ API ขึ้นใช้งานจริงบน Railway พร้อม MySQL ในโปรเจกต์เดียวกัน
สิ่งที่ต้องทำใน UI ของ Railway ระบุไว้เป็นขั้นตอน ส่วนสิ่งที่อยู่ในโค้ดถูกเตรียมไว้แล้ว

**ทำไมเลือก Railway:** LINE ถือว่าการตอบ webhook ช้าคือความล้มเหลวแล้วส่งซ้ำ
แพลตฟอร์มที่พัก service เมื่อไม่มีคนใช้จะทำให้ข้อความแรกของทุกช่วงเงียบต้องรอ cold start
30-60 วินาที ซึ่งเกินเวลาที่ LINE รอ ระบบเรารอดเพราะมี idempotency (A30) แต่ผู้ทดสอบจะเห็นเป็นความหน่วง
ที่ดูเหมือนระบบพัง Railway ไม่พัก service จึงตัดปัญหานี้ออกไปทั้งหมด

---

## 1. สร้าง service

1. **New Project → Deploy from GitHub repo** เลือก `symphonySpy/ai-crm`
2. ตั้ง **Root Directory** เป็น `api`
   โครงสร้างเป็น monorepo ถ้าไม่ตั้ง Railway จะ build จากรากซึ่งไม่มี `package.json`
3. **New → Database → Add MySQL** ในโปรเจกต์เดียวกัน

`railway.json` ในโฟลเดอร์ `api` กำหนด start command, health check ที่ `/health`
และนโยบายการรีสตาร์ตไว้แล้ว ไม่ต้องตั้งใน UI ซ้ำ

---

## 2. ตัวแปรสภาพแวดล้อม

ตั้งที่ service ของ API (**Variables**)

| ตัวแปร | ค่า |
|---|---|
| `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` — **อ้างอิงแบบนี้ ไม่ใช่ก๊อปค่า** |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | สุ่มใหม่ 48 ไบต์ ไม่ใช้ซ้ำกับที่อื่น |
| `LINE_ADAPTER` | `live` เมื่อพร้อมต่อ LINE จริง มิฉะนั้น `mock` |
| `LINE_CHANNEL_SECRET` | จาก LINE Developers Console |
| `LINE_CHANNEL_ACCESS_TOKEN` | จาก LINE Developers Console |
| `LOG_LEVEL` | `info` |
| `REST_LOG_ENABLED` | `true` |

`PORT` Railway ตั้งให้เอง ไม่ต้องกำหนด

**สร้าง `SESSION_SECRET`:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

การอ้าง `${{MySQL.MYSQL_URL}}` แทนการก๊อปค่ามาวางสำคัญกว่าที่เห็น เพราะถ้า Railway
หมุนรหัสผ่านฐานข้อมูล ค่าที่อ้างอิงจะตามไปเอง ส่วนค่าที่ก๊อปมาจะค้างอยู่แบบนั้นจนระบบเชื่อมต่อไม่ได้
โดยไม่มีใครรู้ว่าเพราะอะไร

`src/config/database.js` อ่าน `MYSQL_URL` ก่อน แล้วจึงถอยไปใช้ตัวแปรแยก (`DB_HOST` ฯลฯ)
ซึ่งเป็นแบบที่ `.env` บนเครื่องใช้

---

## 3. Migration

**A39: migration ไม่รันตอนแอปเริ่มทำงาน** การ auto-migrate ตอน boot คือวิธีที่ migration
พังตัวเดียวทำให้ทุก instance ล้มพร้อมกัน และทำให้การ rollback กลายเป็นการแข่งกับเวลา

ตั้งที่ **Settings → Deploy → Pre-Deploy Command**

```
npm run deploy:migrate
```

Railway จะรันคำสั่งนี้ให้เสร็จก่อนสลับ traffic ไปยังเวอร์ชันใหม่ ถ้า migration ล้มเหลว
เวอร์ชันเดิมยังรับงานต่อไปตามปกติ

> `sequelize-cli` อยู่ใน `dependencies` ไม่ใช่ `devDependencies` โดยตั้งใจ
> เพราะ Railway build ด้วย `NODE_ENV=production` ซึ่งทำให้ npm ข้าม devDependencies
> ถ้าปล่อยไว้ที่เดิม pre-deploy command จะล้มเหลวด้วย "command not found"

---

## 4. ข้อมูลตั้งต้น (ครั้งเดียว)

```bash
npm i -g @railway/cli
railway login
railway link          # เลือกโปรเจกต์และ service ของ API
railway run npm run deploy:seed
```

ข้อมูลทั้งหมดเป็นข้อมูลสังเคราะห์ (A8) — 2,000 contacts, ~400 companies, 300 leads
พร้อมบทสนทนาและ timeline ย้อนหลัง 90 วัน

---

## 5. เชื่อม LINE webhook

1. คัดลอก public domain จาก Railway (**Settings → Networking → Generate Domain**)
2. ที่ LINE Developers Console → Messaging API → **Webhook URL**

   ```
   https://<your-app>.up.railway.app/webhooks/line
   ```

3. กด **Verify** — ต้องได้ Success
4. เปิด **Use webhook**
5. ปิด **Auto-reply messages** และ **Greeting messages** ไม่อย่างนั้น LINE จะตอบลูกค้าเอง
   ทับข้อความที่ผ่านการอนุมัติจากระบบ (A34)

**ถ้า Verify ไม่ผ่าน** ให้ดู `rest_log` ก่อนเดา:

```sql
SELECT request_date, status_code, request_body
FROM rest_log WHERE path LIKE '/webhooks%' ORDER BY id DESC LIMIT 5;
```

`401` แปลว่าลายเซ็นไม่ผ่าน ซึ่งเกือบทุกครั้งหมายถึง `LINE_CHANNEL_SECRET` ไม่ตรงกับ channel
ที่กำลังทดสอบ **อย่าแก้ด้วยการปิดการตรวจลายเซ็น** — นั่นคือการเปิดให้ใครก็ได้ยิงข้อมูลเข้าระบบ

---

## 6. ตรวจหลัง deploy

```bash
curl https://<your-app>.up.railway.app/health
curl https://<your-app>.up.railway.app/ready
```

`/health` ตอบได้โดยไม่แตะฐานข้อมูล ส่วน `/ready` ตอบ `503` เมื่อต่อฐานข้อมูลไม่ได้
การแยกสองอย่างนี้ทำให้แพลตฟอร์มไม่รีสตาร์ตโปรเซสที่ทำงานปกติเพียงเพราะฐานข้อมูลสะดุดชั่วขณะ

---

## ข้อจำกัดที่รู้อยู่

**เครดิตทดลอง 30 วัน / $5** ค่าใช้จ่ายเดินตลอดเพราะ service ไม่พัก
ควร deploy ใกล้วันส่งงาน และระบุใน README ว่าระบบสาธิตจะถูกปิดหลังการประเมิน

**ยังไม่มี CI** การ deploy เกิดทุกครั้งที่ push ขึ้น branch `main` โดยไม่มีเทสต์คั่น
อยู่ใน production next steps

**ฐานข้อมูลอยู่ภูมิภาคเดียว ไม่มี read replica และไม่มี dead-letter queue**
webhook ที่ LINE ส่งมาระหว่าง deploy อาจตกหล่น การ retry ของ LINE ครอบคลุมกรณีส่วนใหญ่
และตาราง `line_webhook_events` ทำให้ replay ได้ แต่ยังไม่มีคิวรองรับจริง (A31)
