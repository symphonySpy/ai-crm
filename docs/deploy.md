# การติดตั้งขึ้น Railway

**ระบบที่ติดตั้งแล้ว:** https://ai-crm-production-dee4.up.railway.app
`GET /health` และ `GET /ready` ตอบ 200 · ข้อมูลสาธิตลงครบแล้ว

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
| `PORT` | `4000` — **ต้องตั้งเอง** ดูหัวข้อข้อผิดพลาดด้านล่าง |

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


---

## ข้อผิดพลาดที่เจอจริงตอนติดตั้ง และวิธีแก้

บันทึกไว้เพราะทั้งสี่ข้อเสียเวลาไปมาก และไม่มีข้อไหนที่อ่านจากเอกสารแล้วเดาได้ล่วงหน้า

### 1. ต้องติดตั้ง Railway GitHub App **ก่อน** สร้าง service

การวาง URL ของ repo ลงในช่องค้นหาทำให้ Railway สร้าง service ได้ **แต่นั่นเป็นเพียงการบันทึกที่อยู่
ไม่ได้แปลว่าอ่านโค้ดได้** ผลที่ตามมาคือ:

- หน้า Settings ขึ้น `GitHub Repo not found`
- **ค่า Root Directory ที่ตั้งไว้ไม่ถูกบันทึก** และกลับไปเป็นค่าว่างทุกครั้ง
- build อ่านจากรากของ repo ซึ่งไม่มี `package.json` แล้วล้มเหลวด้วยข้อความ
  `Railpack could not determine how to build the app`

อาการที่เห็น (Root Directory ไม่ยอมบันทึก) ไม่ได้ชี้ไปยังสาเหตุ (ไม่มีสิทธิ์เข้าถึง repo) เลย

**แก้:** ติดตั้ง GitHub App ให้เข้าถึง repo ก่อน จากนั้น **Disconnect แล้ว Connect repo ใหม่**
การติดตั้งสิทธิ์อย่างเดียวไม่พอ เพราะ service ยังจำสถานะเดิมที่เสียอยู่

### 2. การ Disconnect repo ล้างค่า Pre-Deploy Command ไปด้วย

หลังต่อ repo ใหม่ การ deploy สำเร็จและ `/ready` ตอบ 200 แต่ `POST /api/auth/login` ตอบ 500
เพราะตารางยังไม่ถูกสร้าง — `Pre-Deploy Command` หายไปพร้อมการ disconnect

**บทเรียน:** `/ready` ตรวจแค่ว่า **ต่อฐานข้อมูลติด** ไม่ได้ตรวจว่า schema ถูกต้อง
เป็นการแยกที่ตั้งใจ (ดูหัวข้อ 6) แต่แปลว่า readiness ที่เขียว **ไม่ได้แปลว่า migration รันแล้ว**
วิธียืนยันที่เร็วที่สุดคือเรียก endpoint ที่แตะตารางจริง แล้วดูว่าได้ `401` (ตารางมี ข้อมูลยังไม่มี)
หรือ `500` (ตารางยังไม่มี)

### 3. ต้องตั้ง `PORT` เอง

Railway ถามพอร์ตปลายทางตอนสร้าง domain โดยเสนอ `8080` มาให้ ส่วนแอปอ่าน
`process.env.PORT` แล้วถอยไปที่ `4000` ถ้าไม่มีค่า สองฝั่งจึงไม่ตรงกันและได้
`502 Application failed to respond`

**แก้:** ตั้งตัวแปร `PORT=4000` ให้ชัดเจน และตั้ง target port ของ domain เป็น `4000` เท่ากัน
การกำหนดทั้งสองฝั่งดีกว่าการพึ่งค่าที่แพลตฟอร์มใส่ให้ เพราะเมื่อไม่ตรงกัน
อาการที่ได้คือ 502 ซึ่งไม่บอกเลยว่าปัญหาอยู่ที่พอร์ต

### 4. ข้อมูลสาธิตต้องสั่งลงเอง

`Pre-Deploy Command` รันเฉพาะ migration ไม่รวม seeder โดยตั้งใจ — การใส่ข้อมูลตัวอย่างทุกครั้ง
ที่ deploy จะเขียนทับสิ่งที่ผู้ทดสอบกำลังดูอยู่

รันครั้งเดียวผ่านแท็บ **Console** ของ service:

```
npm run deploy:seed
```

---

## 5. ติดตั้งเว็บ (Next.js) เป็นอีก service

เว็บกับ API อยู่ repo เดียวกัน แต่เป็นคนละ service บน Railway เพราะ build คนละแบบ
และคนละรอบการปล่อย

1. ในโปรเจกต์เดิม กด **New → GitHub Repo** เลือก `symphonySpy/ai-crm` อีกครั้ง
2. ตั้ง **Root Directory** เป็น `web`
3. **Variables** ตั้งค่าเดียว

| ตัวแปร | ค่า |
|---|---|
| `API_BASE_URL` | `https://<โดเมนของ service API>` เช่น `https://ai-crm-production-dee4.up.railway.app` |

4. **Settings → Networking → Generate Domain** เพื่อให้เว็บมี URL สาธารณะ
   **target port ต้องเป็น `8080`** — ดูหัวข้อถัดไป

**ติดตั้งแล้ว:** https://miraculous-essence-production-509a.up.railway.app

### พอร์ต: ทำไมได้ 502 ทั้งที่ deploy ขึ้นสีเขียว

Railway ใส่ `PORT=8080` ให้ตอนรัน **โดยไม่แสดงในหน้า Variables** แอปจึงฟังที่ 8080
(`next start -p ${PORT:-3000}`) ถ้าตอน Generate Domain ใส่ target port เป็นค่าอื่น
proxy จะส่งไปผิดพอร์ต ได้ 502 พร้อม header `x-railway-fallback: true`
ขณะที่สถานะ deploy ยังเป็น Active และ log ไม่มีอะไรผิดปกติ

วิธีเช็คเร็วที่สุด: เปิด **Deploy Logs** ดูบรรทัด `- Network: http://[::]:<พอร์ต>`
แล้วตั้ง target port ของ domain ให้ตรงกับเลขนั้น

`web/railway.json` กำหนด start command และ health check ที่ `/login` ไว้แล้ว

### ทำไมไม่ต้องตั้ง CORS_ORIGINS

เบราว์เซอร์คุยกับโดเมนของเว็บเท่านั้น ส่วน `/api` ถูก Next.js proxy ต่อไปยัง API
จากฝั่งเซิร์ฟเวอร์ ซึ่งไม่ใช่คำขอข้ามโดเมนของเบราว์เซอร์ จึงไม่มี CORS เข้ามาเกี่ยวข้อง
(A45) — ปล่อย `CORS_ORIGINS` ว่างไว้ตามเดิม

### ข้อควรรู้: `API_BASE_URL` ถูกอ่านตอน build

Next.js คอมไพล์ rewrites ลง routes manifest ตอน `next build` ไม่ได้อ่านใหม่ทุก request
ถ้าแก้ค่านี้ **ต้อง redeploy** การกด restart อย่างเดียวจะไม่มีผลกับ proxy

---

## สถานะที่ยืนยันแล้วหลังติดตั้ง

| การทดสอบ | ผล |
|---|---|
| `GET /health` | `200` ไม่แตะฐานข้อมูล |
| `GET /ready` | `200` ฐานข้อมูลเข้าถึงได้ |
| `POST /api/auth/login` ด้วยบัญชีสาธิต | `200` ได้ session |
| `GET /api/leads/summary` | ครบ 5 stage · 300 leads · มูลค่ารวม ~136 ล้านบาท |
| `GET /api/leads` | 300 รายการ |
| `GET /api/contacts` · `companies` · `users` | 1,904 · 387 · 10 |
| `GET /api/leads` โดยไม่มี session | `401` |
| `POST /webhooks/line` ลายเซ็นผิด | ปฏิเสธ |

**LINE webhook ยังไม่ได้ตั้งค่า** — `LINE_CHANNEL_SECRET` ยังไม่ถูกกำหนด จึงตอบ `500`
พร้อมข้อความ `Webhook not configured` ซึ่งเป็นพฤติกรรมที่ตั้งใจ: การขาดค่าตั้งค่าคือความผิดพลาด
ฝั่งการติดตั้ง ไม่ใช่คำขอที่ไม่ถูกต้อง จึงไม่ควรรายงานเป็น `401` ที่แปลว่า "ลายเซ็นของคุณผิด"
