# Cinema Booking

เว็บแอปพลิเคชันจองตั๋วภาพยนตร์ พัฒนาด้วย HTML, JavaScript, Express และ Firebase เพื่อฝึกสร้างระบบจองตั้งแต่การเลือกภาพยนตร์ รอบฉาย ที่นั่ง ไปจนถึงการยืนยันการจอง

> โปรเจกต์นี้เป็นผลงานระหว่างเรียน รายวิชา 02739322 Information System Analysis and Design

## เกี่ยวกับโปรเจกต์

Cinema Booking ช่วยให้ผู้ใช้ค้นหาภาพยนตร์ ดูรายละเอียดและรอบฉาย เลือกที่นั่ง ตรวจสอบราคา และยืนยันการจองได้ภายในเว็บไซต์เดียว นอกจากนี้ยังมีระบบสมาชิก คะแนนสะสม โปรโมชั่น หน้าตรวจสอบประวัติการจอง และระบบหลังบ้านสำหรับผู้ดูแลระบบ ข้อมูลทุกอย่างที่แสดงบนหน้าเว็บ (ภาพยนตร์ รอบฉาย สาขา โปรโมชั่น ราคา และกติกาคะแนน) ดึงจากฐานข้อมูลผ่าน API และแก้ไขได้จากหลังบ้าน

โปรเจกต์นี้แสดงการประยุกต์ใช้ Firebase Authentication และ Cloud Firestore ร่วมกับ REST API บน Express (รันบน Vercel serverless) โดยแยกส่วนหน้าเว็บ ส่วน API และการตั้งค่า deployment ออกจากกันอย่างชัดเจน

- เว็บไซต์: https://my-web-project-491413.web.app
- API: https://cinema-booking-02739322.vercel.app/api/health

## บัญชีทดลองสำหรับตรวจงาน

ข้อมูลในระบบเป็นข้อมูลสมมุติสำหรับงานรายวิชา ใช้บัญชีด้านล่างเข้าสู่ระบบได้ทันที

| บทบาท | อีเมล | รหัสผ่าน | ใช้ทดสอบ |
| --- | --- | --- | --- |
| ผู้ดูแลระบบ | `admin@cinemabooking.test` | `Admin02739322!` | หน้า `/admin.html` (จัดการภาพยนตร์ รอบฉาย สาขา ราคา โปรโมชั่น เช็คอิน รายงาน) |
| ลูกค้า | `customer@cinemabooking.test` | `Customer02739322!` | จองตั๋ว ใช้โค้ด `FREE100` หรือ `MONDAY100` ดูประวัติการจอง |

- เป็นบัญชีทดลองสำหรับตรวจงานเท่านั้น
- การชำระเงินใช้ **Stripe โหมดทดสอบ (Sandbox)** ไม่มีการตัดเงินจริง ในหน้าชำระเงินของ Stripe ใช้บัตรทดสอบ `4242 4242 4242 4242` วันหมดอายุใดก็ได้ในอนาคต (เช่น `12/30`) CVC `123` หรือเลือก PromptPay แล้วกดยืนยันการชำระเงินทดสอบ

## ความสามารถหลัก

### ฝั่งลูกค้า

- สมัครสมาชิกและเข้าสู่ระบบด้วย Firebase Authentication
- ค้นหาและกรองภาพยนตร์ ดูรายละเอียดและนักแสดง
- **โปรแกรมหน้า (Coming Soon)** ในหน้าแรก ดึงจากภาพยนตร์สถานะ `coming_soon` เรียงตามวันเข้าฉาย และหน้ารายละเอียดแสดงวันเข้าฉายแทนปุ่มซื้อตั๋ว
- **ค้นหารอบฉายตามวันที่** (แสดงรอบฉายล่วงหน้า 14 วัน)
- เลือกที่นั่ง (Sofa Pair, Premium, Regular) โดยราคามาจากการตั้งค่าของแอดมิน
- **ล็อกที่นั่งชั่วคราว** ระหว่างชำระเงิน (ค่าเริ่มต้น 12 นาที) หมดเวลาแล้วระบบคืนที่นั่งอัตโนมัติ
- ใช้โค้ดส่วนลดและคะแนนสะสม (ราคาคำนวณที่ server ทั้งหมด)
- ชำระเงินผ่าน **Stripe Checkout (โหมดทดสอบ)** รองรับบัตรเครดิตและ PromptPay ระบบตรวจผลการชำระกับ Stripe ที่ server ก่อนออกตั๋ว
- ถ้าจ่ายสำเร็จแต่ที่นั่งหลุดไปแล้ว ระบบคืนเงินผ่าน Stripe อัตโนมัติ
- E-Ticket พร้อม **QR Code จริง** สำหรับสแกนหน้าโรง และคิวอีเมลส่งตั๋ว
- ประวัติการจองพร้อมสถานะ (รอชำระเงิน / ชำระแล้ว / ใช้แล้ว / ยกเลิก / หมดเวลา)
- **หน้าโรงภาพยนตร์** แสดงสาขาจากฐานข้อมูล พร้อมรูปและเครดิตภาพ กรองตามภูมิภาคได้
- **หน้าโปรโมชั่น** แสดงเฉพาะโค้ดที่ใช้ได้จริงในรูปแบบคูปอง กดคัดลอกโค้ดได้ บอกวันที่ใช้ได้และจำนวนสิทธิ์ที่เหลือ และบอกว่าสมาชิกใช้โค้ดไหนไปแล้ว
- **หน้าสิทธิพิเศษสมาชิก** แสดงคะแนนจริงของสมาชิก ระดับสมาชิก และความคืบหน้าสู่ระดับถัดไป
- หน้าข้อมูล: เกี่ยวกับเรา ติดต่อเรา คำถามที่พบบ่อย (ค้นหาและกรองหมวดได้) ข้อตกลงการใช้งาน และนโยบายความเป็นส่วนตัวตาม PDPA ตัวเลขในทุกหน้า (ราคา เวลาล็อกที่นั่ง กติกาคะแนน) ดึงจาก `/api/pricing` จึงตรงกับการตั้งค่าเสมอ
- ระหว่างโหลดข้อมูลแสดงโครงหน้า (loading skeleton) แทนข้อมูลตัวอย่าง

### ฝั่งผู้ดูแลระบบ (`/admin.html`)

ออกแบบใหม่ทั้งหมดด้วย design system ของตัวเอง (`admin.css`) มีเมนูด้านข้าง ตัวเลือกวันที่ เวลา และ dropdown แบบกำหนดเอง (`admin-controls.js`) แบ่งหน้ารายการที่ยาว และหน้าต่างแก้ไขแบบกว้างที่มีแท็บกับตัวอย่างแบบสด

| เมนู | ความสามารถ |
| --- | --- |
| ภาพรวม | รายได้ ตั๋ว การจองวันนี้ กราฟรายได้ 7 วัน หนังขายดี และรอบฉายวันนี้ |
| ภาพยนตร์ | เพิ่ม / แก้ไข / ลบ (เรื่องที่มีประวัติการจองจะเก็บถาวรแทนการลบ) อัปโหลดโปสเตอร์ ภาพพื้นหลัง และรูปนักแสดงจากเครื่อง พร้อมตัวอย่างการ์ดที่ลูกค้าเห็น และป้ายบอกเรื่องที่ยังไม่มีโปสเตอร์ |
| รอบฉาย | สร้างหลายวันหลายเวลาพร้อมกัน แสดงตารางเวลาของโรงแบบสดเพื่อเห็นรอบที่ชนกันก่อนกดสร้าง ย้าย/ปิดรอบ ดูผังที่นั่ง แยกรายการตามวัน |
| สาขา | เพิ่ม / แก้ไขสาขา ภูมิภาค ระบบฉาย โรงย่อย และอัปโหลดรูปสาขา (ชื่อสาขาแก้ไม่ได้หลังสร้างเพราะรอบฉายอ้างอิงด้วยชื่อ ลบสาขาหรือโรงย่อยที่ยังมีรอบฉายไม่ได้) |
| การจอง / เช็คอิน | ค้นหาด้วย Booking ID หรืออีเมล เช็คอินด้วยการสแกน QR (กล้อง) ยกเลิกและคืนเงิน (คืนผ่าน Stripe อัตโนมัติ) |
| รายงาน | ยอดขายรายวัน/รายเดือน ผู้ชมแยกตามภาพยนตร์ ที่นั่งที่ถูกจองในแต่ละรอบ ส่งออก Excel (CSV) และ PDF |
| ราคาตั๋ว | ราคาแต่ละประเภทที่นั่ง ค่าบริการ เวลาล็อกที่นั่ง และกติกาคะแนนสะสม |
| โปรโมชั่น | สร้างโค้ดส่วนลด (บาท/เปอร์เซ็นต์) กำหนดวันที่ใช้ได้ ช่วงเวลา และจำนวนสิทธิ์ พร้อมตัวอย่างคูปองและตัวอย่างการคิดเงิน |
| ผู้ใช้ | ดูรายชื่อสมาชิก ให้หรือถอนสิทธิ์ผู้ดูแลระบบ |

### ความปลอดภัย

- ทุก endpoint ที่เกี่ยวกับผู้ใช้ตรวจ **Firebase ID token** ที่ server (ไม่เชื่อ `uid` ที่ส่งมาจากหน้าเว็บ)
- ลูกค้าเห็นได้เฉพาะข้อมูลและการจองของตัวเอง ส่วน `/api/admin/*` ใช้ได้เฉพาะ role `admin`
- การจอง การชำระเงิน การคืนเงิน และการเช็คอินทำใน Firestore transaction จึงไม่เกิดการจองที่นั่งซ้ำ
- `firestore.rules` ปิดการเข้าถึง Firestore จากหน้าเว็บโดยตรงทั้งหมด (ทุกอย่างผ่าน API)
- รูปที่อัปโหลดตรวจชนิดไฟล์จากเนื้อไฟล์จริง (JPEG / PNG / WebP) จำกัดขนาด และรับเฉพาะจากแอดมิน
- API สาธารณะของโปรโมชั่นส่งเฉพาะจำนวนสิทธิ์ที่เหลือ ไม่เปิดเผยยอดใช้จริง

### รูปภาพ

- **รูปที่แอดมินอัปโหลด** ระบบย่อรูปในเบราว์เซอร์ก่อนส่ง เก็บใน collection `images` และเปิดผ่าน `GET /api/images/:id` (cache ระยะยาว) รูปที่ไม่ได้ใช้แล้วถูกลบอัตโนมัติเมื่อเปลี่ยนหรือลบภาพยนตร์ / สาขา
- **ภาพยนตร์ที่ยังไม่มีโปสเตอร์** ได้ภาพวาดที่ระบบสร้างเอง (SVG) ตามแนวหลักของหนัง เช่น สยองขวัญ แอ็คชัน แอนิเมชัน ไซไฟ ดราม่า ผจญภัย ส่วนนักแสดงที่ไม่มีรูปแสดงเป็นภาพเงาแบบไม่มีหน้า เมื่ออัปโหลดรูปจริงระบบจะใช้รูปที่อัปโหลดแทนทันที
- **รูปสาขา** เป็นภาพสัญญาอนุญาตเสรีจาก Wikimedia Commons ครอปและย่อขนาดแล้วเก็บไว้ใน `public/img/branches/` พร้อมเครดิตใต้รูปทุกภาพ (ดูหัวข้อ "เครดิตรูปภาพ")
- ไม่มีการดึงรูปจาก Wikipedia อัตโนมัติอีกแล้ว

## เทคโนโลยีที่ใช้

| หมวด | เทคโนโลยี |
| --- | --- |
| Frontend | HTML5, JavaScript, Tailwind CSS |
| Backend | Node.js, Express |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Serverless API | Vercel Functions + Vercel Cron (ใช้ Express ชุดเดียวกับ Firebase Cloud Functions) |
| Payment | Stripe Checkout (Test mode / Sandbox) |
| Hosting | Firebase Hosting |
| Runtime | Node.js 22 |

## โครงสร้างโปรเจกต์

```text
.
├── public/
│   ├── index.html, movies.html          # หน้าแรก (รวมโปรแกรมหน้า) และรายการภาพยนตร์
│   ├── movie-details.html               # รายละเอียดภาพยนตร์ + เลือกวัน/รอบฉาย
│   ├── seat-selection.html              # เลือกที่นั่ง + ล็อกที่นั่ง
│   ├── checkout.html                    # ส่วนลด คะแนน และชำระเงิน
│   ├── booking-confirmation.html        # E-Ticket + QR Code
│   ├── user.html                        # โปรไฟล์และประวัติการจอง
│   ├── cinemas.html, promotions.html    # สาขา และคูปองโค้ดส่วนลด
│   ├── about / contact / faq / membership / terms-of-service / privacy-policy .html
│   ├── admin.html, admin.js, admin.css  # ระบบหลังบ้าน
│   ├── admin-controls.js                # dropdown / ตัวเลือกวันที่ / เวลา ของหลังบ้าน
│   ├── site.css, site-ui.js             # design system, header, footer และหน้าต่างเข้าสู่ระบบของฝั่งลูกค้า
│   ├── info-pages.js                    # ดึงราคา/กติกาคะแนนจาก API ใส่ในหน้าข้อมูล และสารบัญ
│   ├── firebase-init.js                 # Firebase config (ที่เดียว)
│   ├── cinema-api.js                    # client สำหรับเรียก API พร้อม ID token
│   ├── auth.js                          # หน้าต่างเข้าสู่ระบบ / สมัครสมาชิก
│   ├── movies-data.js                   # ข้อมูลสำรอง + ภาพโปสเตอร์/นักแสดงที่ระบบสร้างเอง
│   └── img/branches/                    # รูปสาขา (Wikimedia Commons)
├── api/index.js                         # entry ของ Vercel (ใช้ functions/app.js)
├── vercel.json                          # route /api/* + cron วันละครั้ง
├── functions/
│   ├── index.js                         # export Cloud Functions (ใช้กับ emulator / Blaze plan)
│   ├── app.js                           # REST API ทั้งหมด (ใช้ร่วมกับ server.js)
│   ├── lib/domain.js                    # ผังที่นั่ง ราคา ส่วนลด กติกาโปรโมชั่น
│   ├── lib/store.js                     # transaction: ล็อกที่นั่ง ชำระเงิน คืนเงิน เช็คอิน
│   ├── lib/payments.js                  # Stripe Checkout (สร้างหน้าชำระเงิน ตรวจผล คืนเงิน)
│   ├── lib/seed.js                      # สร้างข้อมูลตั้งต้น / migrate ข้อมูลเวอร์ชันเก่า (seed v1–v6)
│   ├── data/movies-data.js              # ข้อมูลภาพยนตร์ตั้งต้น
│   ├── data/coming-soon.js              # ภาพยนตร์โปรแกรมหน้าตั้งต้น
│   ├── data/cinemas.js                  # รายชื่อสาขา + รูปและเครดิต
│   └── test/e2e.mjs                     # ทดสอบ API แบบ end-to-end บน emulator
├── server.js                            # Express server สำหรับรันในเครื่อง
├── firebase.json, firestore.rules       # Hosting, Functions, Emulators, Firestore rules
└── package.json
```

### โครงสร้างข้อมูลใน Firestore

| Collection | ข้อมูล |
| --- | --- |
| `movies` | ภาพยนตร์ (`status`: `now_showing`, `coming_soon`, `archived`) |
| `showtimes` | รอบฉาย (`movieId`, `cinema`, `hall`, `date`, `startTime`, `endTime`, `status`) |
| `seatMaps` | ที่นั่งของแต่ละรอบ (`booked` และ `holds` ที่มีเวลาหมดอายุ) |
| `bookings` | การจอง (`status`: `pending` → `paid` → `used` หรือ `cancelled` / `expired`) |
| `users` | สมาชิก คะแนนสะสม โค้ดที่ใช้แล้ว และ `role` |
| `promotions` | โค้ดส่วนลด |
| `cinemas` | สาขา: ชื่อ ที่ตั้ง ภูมิภาค ระบบฉาย โรงย่อย รูป และเครดิตรูป |
| `images` | รูปที่แอดมินอัปโหลด (ข้อมูลไฟล์ ชนิด ขนาด ผู้อัปโหลด) |
| `meta/seed` | เวอร์ชันของข้อมูลตั้งต้นที่ migrate แล้ว |
| `settings/pricing` | ราคาที่นั่ง ค่าบริการ เวลาล็อกที่นั่ง กติกาคะแนน |
| `mail` | อีเมล E-Ticket (รูปแบบของ Firebase Extension "Trigger Email") |

## การติดตั้งและรัน

### สิ่งที่ต้องมี

- Node.js 22, npm และ Firebase CLI (`npm install -g firebase-tools`)
- Java 11+ (สำหรับ Firestore emulator)

```bash
npm install
cd functions && npm install && cd ..
```

### รันในเครื่องด้วย Firebase Emulator (แนะนำ)

ใช้โปรเจกต์จำลอง `demo-cinema` จึงไม่แตะข้อมูลจริง

```bash
npm run emulators
```

- เว็บไซต์: http://127.0.0.1:5050
- Emulator UI (ดูข้อมูลใน Firestore / Auth): http://127.0.0.1:4000
- สมัครสมาชิกด้วยอีเมล `admin@cinema.test` จะได้สิทธิ์แอดมินอัตโนมัติ (ตั้งไว้ใน `functions/.env.demo-cinema`) แล้วเข้า http://127.0.0.1:5050/admin.html

บน emulator การชำระเงินเป็นแบบจำลองเสมอ หากต้องการลอง Stripe ในเครื่อง ให้ใส่ `STRIPE_SECRET_KEY` ใน `functions/.env` และสร้าง `functions/.env.local` ที่มี `USE_STRIPE_IN_EMULATOR=true` (ทั้งสองไฟล์ไม่ถูก commit) แล้วรัน `npm run emulators` ใหม่ (ลบ `.env.local` ก่อนรัน `npm test`)

### ทดสอบ

```bash
npm test
```

เปิด emulator ใหม่ รันการทดสอบ API แบบ end-to-end 82 ข้อ (สมัครสมาชิก ล็อกที่นั่ง จ่ายเงิน หมดเวลา คืนเงิน คะแนนสะสม เช็คอิน รายงาน สิทธิ์แอดมิน อัปโหลดรูป สาขา โปรโมชั่น ฯลฯ) แล้วปิด emulator

### รันด้วย Express server (เชื่อม Firestore จริง)

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/service-account.json npm run dev
```

ห้าม commit service account หรือไฟล์ `.env` ลง repository

## Deploy และตั้งค่าผู้ดูแลระบบ

ใช้บริการฟรีทั้งหมด: Authentication, Firestore และ Hosting อยู่ใน Firebase project **Cinema Booking 02739322** (Project ID `my-web-project-491413`, แพ็กเกจ Spark) ส่วน API รันบน Vercel (Hobby) เพราะ Cloud Functions ต้องใช้ Blaze plan

### API บน Vercel

1. สร้าง service account key: Firebase Console → Project settings → Service accounts → Generate new private key (ห้าม commit ไฟล์นี้)
2. ตั้ง Environment Variables ของโปรเจกต์ Vercel (Production)
   - `FIREBASE_SERVICE_ACCOUNT` = เนื้อหาไฟล์ service account (JSON หรือ base64)
   - `ADMIN_EMAILS` = อีเมลผู้ดูแลระบบ คั่นหลายอีเมลด้วยจุลภาคได้
   - `STRIPE_SECRET_KEY` = Secret key ของ Stripe **Sandbox** (ขึ้นต้นด้วย `sk_test_`) ระบบไม่ยอมรับ live key ถ้าไม่ใส่จะใช้การชำระเงินแบบจำลอง
   - `CRON_SECRET` = ข้อความสุ่ม ใช้ป้องกัน `/api/cron/release-holds`
3. Deploy

   ```bash
   npx vercel deploy --prod
   ```

`.vercelignore` กันไม่ให้ไฟล์ `.env` และ service account ถูกอัปโหลด

### หน้าเว็บบน Firebase Hosting

```bash
firebase deploy --only hosting,firestore:rules --project my-web-project-491413
```

หน้าเว็บบน `*.web.app` เรียก API ที่ Vercel (ตั้งไว้ใน `public/cinema-api.js`) เมื่อแอดมินคนแรกเข้าสู่ระบบ จะให้สิทธิ์คนอื่นเพิ่มได้จากเมนู "ผู้ใช้" ในหน้าแอดมิน

ครั้งแรกที่ API ทำงาน ระบบจะ migrate ข้อมูลให้อัตโนมัติตามเวอร์ชันที่บันทึกไว้ใน `meta/seed` (ทำเฉพาะขั้นที่ยังไม่เคยทำ และเติมเฉพาะข้อมูลที่ยังไม่มี ไม่ทับสิ่งที่แอดมินแก้ไว้)

| เวอร์ชัน | สิ่งที่ทำ |
| --- | --- |
| v1–v3 | สร้างภาพยนตร์ สาขา และรอบฉายตัวอย่าง 7 วันข้างหน้า ราคา และโค้ดส่วนลดตั้งต้น ซ่อนรอบเก่าที่ไม่มีวันที่ แปลงข้อมูลภาพยนตร์รูปแบบเก่า และตั้งสถานะการจองเดิมเป็น "ชำระแล้ว" |
| v4 | เพิ่มภาพยนตร์โปรแกรมหน้า 6 เรื่อง |
| v5 | ย้ายรายชื่อสาขา 14 แห่งจากหน้าเว็บเข้าฐานข้อมูล |
| v6 | ใส่รูปสาขาพร้อมเครดิต (เฉพาะสาขาที่ยังไม่มีรูป) |

รอบฉายตัวอย่างสร้างไว้แค่ 7 วัน หลังจากนั้นให้สร้างรอบใหม่จากเมนู "รอบฉาย" ในหน้าแอดมิน

Vercel Cron (แพ็กเกจฟรีรันได้วันละครั้ง) ปิดการจองที่ไม่ชำระเงิน แต่ที่นั่งยังถูกคืนตามเวลาเสมอเพราะ API ตรวจเวลาหมดอายุทุกครั้งที่อ่าน ถ้าเปลี่ยนไปใช้ Blaze plan ก็ deploy `functions/` เป็น Cloud Functions ได้ตามเดิม (`firebase deploy --only functions`)

การส่ง E-Ticket ทางอีเมลต้องติดตั้ง Firebase Extension **Trigger Email** (ตั้ง collection เป็น `mail` และตั้งค่า SMTP) ถ้ายังไม่ติดตั้ง ระบบจะเก็บอีเมลไว้ใน collection `mail` เฉย ๆ

## สถานะและข้อจำกัด

- การชำระเงินใช้ Stripe โหมดทดสอบเท่านั้น หากจะรับเงินจริงต้องยืนยันบัญชี Stripe และเปลี่ยนเป็น live key
- เปิด/ปิดช่องทางชำระเงิน (บัตร, PromptPay ฯลฯ) ได้ที่ Stripe Dashboard → Settings → Payment methods
- ผังที่นั่งเป็นแบบเดียวทุกโรง (24 ที่นั่ง แถว A–D)
- ข้อมูลภาพยนตร์ตั้งต้นเป็นข้อมูลตัวอย่าง โปสเตอร์ใช้ภาพที่ระบบสร้างจนกว่าแอดมินจะอัปโหลดรูปจริง ภาพของภาพยนตร์โปรแกรมหน้ามาจากเทมเพลตดีไซน์ ไม่ใช่โปสเตอร์จริง
- ช่องทางติดต่อในหน้า "ติดต่อเรา" เป็นข้อมูลสมมุติ แก้ได้ที่ `public/info-pages.js`
- ยังไม่มีปุ่มรีเซ็ตรหัสผ่านด้วยตนเอง และรายการ "อยากดู" เก็บไว้ในเบราว์เซอร์ของเครื่องที่ใช้งานเท่านั้น
- ระดับสมาชิก (ซิลเวอร์ / โกลด์ / แพลทินัม) เป็นป้ายแสดงตามคะแนนคงเหลือ ยังไม่มีสิทธิประโยชน์แยกตามระดับ

## แนวทางพัฒนาต่อ

- เพิ่ม Stripe webhook เพื่อยืนยันการชำระเงินทันทีแม้ลูกค้าปิดหน้าเว็บ (ตอนนี้ระบบตรวจตอนลูกค้ากลับมาหน้าเว็บและตอน cron รัน)
- กำหนดผังที่นั่งแยกตามโรงย่อย
- เพิ่ม rate limiting และจำกัด CORS ให้รับเฉพาะโดเมนของเว็บไซต์
- เพิ่ม CI สำหรับรัน `npm test`
- เพิ่มระบบรีเซ็ตรหัสผ่าน และเก็บรายการ "อยากดู" ไว้ในบัญชี
- สิทธิประโยชน์แยกตามระดับสมาชิก

## เครดิตรูปภาพ

รูปสาขาใน `public/img/branches/` มาจาก Wikimedia Commons ภายใต้สัญญาอนุญาตของแต่ละภาพ ถูกครอปเป็นสัดส่วน 4:3 และย่อขนาดเพื่อใช้แสดงผล รูปที่ดัดแปลงจากภาพ CC BY-SA เผยแพร่ภายใต้สัญญาอนุญาตเดียวกัน

| สาขา | ผู้ถ่ายภาพ | สัญญาอนุญาต | ต้นฉบับ |
| --- | --- | --- | --- |
| Paragon Cineplex | Wpcpey | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Siam_Paragon_Level_5_Paragon_Cinema_2011.jpg) |
| Major Cineplex Ratchayothin | jarcje | CC BY 2.5 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Major_Cineplex_Ratchayothin.jpg) |
| Icon Siam Cineplex | Slyronit | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Approaching_Iconsiam_from_Chao_Phraya_River,_Bangkok.jpg) |
| Major Cineplex Sukhumvit | Curtis Winston | CC BY 2.5 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Majorcineplexsukhumvit.jpg) |
| Major Cineplex Central Westgate | Kanlife99 | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:CentralPlazaWestGateRTB30Aug15.jpg) |
| Major Cineplex Central Chiangmai Airport | Seashell | FAL | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Central_Plaza_Chiang_Mai_Airport.jpg) |
| Major Cineplex Central Phitsanulok | SietsL | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:CentralPlaza_Phitsanulok_2020.2.jpg) |
| Major Cineplex Central Korat | Takeaway | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:2019_02_Central_Mall_Korat_exterior.jpg) |
| Major Cineplex Central Khon Kaen | NELLA32 | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Central_KhonKaen,_Mittraphap_gate.jpg) |
| Major Cineplex Central Udon | Z3144228 | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Central_Plaza_Udon_Thani.jpg) |
| Major Cineplex Central Rayong (ภาพพิพิธภัณฑ์ระยอง (ยังไม่มีภาพของสาขา)) | Gatetaixin | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Rayong_Museum.jpg) |
| Major Cineplex Harbor Pattaya (ภาพชายหาดพัทยา (ยังไม่มีภาพของสาขา)) | Sergey S. Dukachev | CC BY-SA 3.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pattaya_beach_from_view_point.jpg) |
| Major Cineplex Central Phuket | Deepak-nsk | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Central_Phuket_shopping_mall.jpg) |
| Major Cineplex Central Hatyai | Qhairy | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Exterior_Building_of_Central_Hatyai.jpg) |

## ผู้พัฒนา

พัฒนาโดย [Catboyz-45](https://github.com/Catboyz-45) เพื่อใช้เป็นโปรเจกต์ฝึกพัฒนาเว็บแอปพลิเคชันและประกอบแฟ้มผลงาน
