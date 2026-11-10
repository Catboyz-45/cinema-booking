# Cinema Booking

เว็บแอปพลิเคชันจองตั๋วภาพยนตร์ พัฒนาด้วย HTML, JavaScript, Express และ Firebase เพื่อฝึกสร้างระบบจองตั้งแต่การเลือกภาพยนตร์ รอบฉาย ที่นั่ง ไปจนถึงการยืนยันการจอง

> โปรเจกต์นี้เป็นผลงานระหว่างเรียน รายวิชา 02739322 Information System Analysis and Design

## เกี่ยวกับโปรเจกต์

Cinema Booking ช่วยให้ผู้ใช้ค้นหาภาพยนตร์ ดูรายละเอียดและรอบฉาย เลือกที่นั่ง ตรวจสอบราคา และยืนยันการจองได้ภายในเว็บไซต์เดียว นอกจากนี้ยังมีระบบสมาชิก คะแนนสะสม โปรโมชั่น หน้าตรวจสอบประวัติการจอง และระบบหลังบ้านสำหรับผู้ดูแลระบบ

โปรเจกต์นี้แสดงการประยุกต์ใช้ Firebase Authentication และ Cloud Firestore ร่วมกับ REST API บน Express และ Firebase Cloud Functions โดยแยกส่วนหน้าเว็บ ส่วน API และการตั้งค่า deployment ออกจากกันอย่างชัดเจน

## บัญชีทดลองสำหรับตรวจงาน

ข้อมูลในระบบเป็นข้อมูลสมมุติสำหรับงานรายวิชา ใช้บัญชีด้านล่างเข้าสู่ระบบได้ทันที

| บทบาท | อีเมล | รหัสผ่าน | ใช้ทดสอบ |
| --- | --- | --- | --- |
| ผู้ดูแลระบบ | `admin@cinemabooking.test` | `Admin02739322!` | หน้า `/admin.html` (จัดการภาพยนตร์ รอบฉาย ราคา โปรโมชั่น เช็คอิน รายงาน) |
| ลูกค้า | `customer@cinemabooking.test` | `Customer02739322!` | จองตั๋ว ใช้โค้ด `FREE100` หรือ `MONDAY100` ดูประวัติการจอง |

- เป็นบัญชีทดลองสำหรับตรวจงานเท่านั้น
- การชำระเงินใช้ **Stripe โหมดทดสอบ (Sandbox)** ไม่มีการตัดเงินจริง ในหน้าชำระเงินของ Stripe ใช้บัตรทดสอบ `4242 4242 4242 4242` วันหมดอายุใดก็ได้ในอนาคต (เช่น `12/30`) CVC `123` หรือเลือก PromptPay แล้วกดยืนยันการชำระเงินทดสอบ

## ความสามารถหลัก

### ฝั่งลูกค้า

- สมัครสมาชิกและเข้าสู่ระบบด้วย Firebase Authentication
- ค้นหาและกรองภาพยนตร์ ดูรายละเอียดและนักแสดง
- **ค้นหารอบฉายตามวันที่** (รอบฉายล่วงหน้า 14 วัน)
- เลือกที่นั่ง (Sofa Pair, Premium, Regular) โดยราคามาจากการตั้งค่าของแอดมิน
- **ล็อกที่นั่งชั่วคราว** ระหว่างชำระเงิน (ค่าเริ่มต้น 12 นาที) หมดเวลาแล้วระบบคืนที่นั่งอัตโนมัติ
- ใช้โค้ดส่วนลดและคะแนนสะสม (ราคาคำนวณที่ server ทั้งหมด)
- ชำระเงินผ่าน **Stripe Checkout (โหมดทดสอบ)** รองรับบัตรเครดิตและ PromptPay ระบบตรวจผลการชำระกับ Stripe ที่ server ก่อนออกตั๋ว
- ถ้าจ่ายสำเร็จแต่ที่นั่งหลุดไปแล้ว ระบบคืนเงินผ่าน Stripe อัตโนมัติ
- E-Ticket พร้อม **QR Code จริง** สำหรับสแกนหน้าโรง และคิวอีเมลส่งตั๋ว
- ประวัติการจองพร้อมสถานะ (รอชำระเงิน / ชำระแล้ว / ใช้แล้ว / ยกเลิก / หมดเวลา)

### ฝั่งผู้ดูแลระบบ (`/admin.html`)

| เมนู | ความสามารถ |
| --- | --- |
| ภาพรวม | รายได้ ตั๋ว การจองวันนี้ กราฟรายได้ 7 วัน หนังขายดี และรอบฉายวันนี้ |
| ภาพยนตร์ | เพิ่ม / แก้ไข / ลบ (เรื่องที่มีประวัติการจองจะเก็บถาวรแทนการลบ) |
| รอบฉาย | สร้างหลายวันหลายเวลาพร้อมกัน กันรอบชนกันในโรงเดียวกัน ย้าย/ปิดรอบ ดูผังที่นั่ง |
| การจอง / เช็คอิน | ค้นหาด้วย Booking ID หรืออีเมล เช็คอินด้วยการสแกน QR (กล้อง) ยกเลิกและคืนเงิน (คืนผ่าน Stripe อัตโนมัติ) |
| รายงาน | ยอดขายรายวัน/รายเดือน ผู้ชมแยกตามภาพยนตร์ ที่นั่งที่ถูกจองในแต่ละรอบ ส่งออก Excel (CSV) และ PDF |
| ราคาตั๋ว | ราคาแต่ละประเภทที่นั่ง ค่าบริการ เวลาล็อกที่นั่ง และกติกาคะแนนสะสม |
| โปรโมชั่น | สร้างโค้ดส่วนลด (บาท/เปอร์เซ็นต์) กำหนดวันที่ใช้ได้ ช่วงเวลา และจำนวนสิทธิ์ |
| ผู้ใช้ | ดูรายชื่อสมาชิก ให้หรือถอนสิทธิ์ผู้ดูแลระบบ |

### ความปลอดภัย

- ทุก endpoint ที่เกี่ยวกับผู้ใช้ตรวจ **Firebase ID token** ที่ server (ไม่เชื่อ `uid` ที่ส่งมาจากหน้าเว็บ)
- ลูกค้าเห็นได้เฉพาะข้อมูลและการจองของตัวเอง ส่วน `/api/admin/*` ใช้ได้เฉพาะ role `admin`
- การจอง การชำระเงิน การคืนเงิน และการเช็คอินทำใน Firestore transaction จึงไม่เกิดการจองที่นั่งซ้ำ
- `firestore.rules` ปิดการเข้าถึง Firestore จากหน้าเว็บโดยตรงทั้งหมด (ทุกอย่างผ่าน API)

## เทคโนโลยีที่ใช้

| หมวด | เทคโนโลยี |
| --- | --- |
| Frontend | HTML5, JavaScript, Tailwind CSS |
| Backend | Node.js, Express |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Serverless API | Firebase Cloud Functions (HTTP + Scheduler) |
| Payment | Stripe Checkout (Test mode / Sandbox) |
| Hosting | Firebase Hosting |
| Runtime | Node.js 22 |

## โครงสร้างโปรเจกต์

```text
.
├── public/
│   ├── index.html, movies.html          # หน้าแรกและรายการภาพยนตร์
│   ├── movie-details.html               # รายละเอียดภาพยนตร์ + เลือกวัน/รอบฉาย
│   ├── seat-selection.html              # เลือกที่นั่ง + ล็อกที่นั่ง
│   ├── checkout.html                    # ส่วนลด คะแนน และชำระเงิน
│   ├── booking-confirmation.html        # E-Ticket + QR Code
│   ├── user.html                        # โปรไฟล์และประวัติการจอง
│   ├── admin.html, admin.js             # ระบบหลังบ้าน
│   ├── firebase-init.js                 # Firebase config (ที่เดียว)
│   ├── cinema-api.js                    # client สำหรับเรียก API พร้อม ID token
│   ├── auth.js                          # หน้าต่างเข้าสู่ระบบ / สมัครสมาชิก
│   └── movies-data.js                   # ข้อมูลภาพยนตร์สำรอง (ใช้เมื่อเรียก API ไม่ได้)
├── functions/
│   ├── index.js                         # export Cloud Functions (api, releaseExpiredHolds)
│   ├── app.js                           # REST API ทั้งหมด (ใช้ร่วมกับ server.js)
│   ├── lib/domain.js                    # ผังที่นั่ง ราคา ส่วนลด กติกาโปรโมชั่น
│   ├── lib/store.js                     # transaction: ล็อกที่นั่ง ชำระเงิน คืนเงิน เช็คอิน
│   ├── lib/payments.js                  # Stripe Checkout (สร้างหน้าชำระเงิน ตรวจผล คืนเงิน)
│   ├── lib/seed.js                      # สร้างข้อมูลตั้งต้น / migrate ข้อมูลเวอร์ชันเก่า
│   ├── data/movies-data.js              # ข้อมูลภาพยนตร์ตั้งต้น
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
| `cinemas` | โรงภาพยนตร์และโรงย่อย |
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

เปิด emulator ใหม่ รันการทดสอบ API แบบ end-to-end (สมัครสมาชิก ล็อกที่นั่ง จ่ายเงิน หมดเวลา คืนเงิน เช็คอิน รายงาน สิทธิ์แอดมิน ฯลฯ) แล้วปิด emulator

### รันด้วย Express server (เชื่อม Firestore จริง)

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/service-account.json npm run dev
```

ห้าม commit service account หรือไฟล์ `.env` ลง repository

## Deploy และตั้งค่าผู้ดูแลระบบ

ทุกส่วน (Authentication, Firestore, Functions, Hosting) อยู่ใน Firebase project **Cinema Booking 02739322** (Project ID `my-web-project-491413`)

1. สร้างไฟล์ `functions/.env` จาก `functions/.env.example` (ไฟล์นี้ไม่ถูก commit)
   - `ADMIN_EMAILS` = อีเมลผู้ดูแลระบบ คั่นหลายอีเมลด้วยจุลภาคได้
   - `STRIPE_SECRET_KEY` = Secret key ของ Stripe **Sandbox** (ขึ้นต้นด้วย `sk_test_`) จาก Stripe Dashboard → Developers → API keys ระบบไม่ยอมรับ live key
   - ถ้าไม่ใส่ `STRIPE_SECRET_KEY` ระบบจะกลับไปใช้การชำระเงินแบบจำลอง
2. Deploy

   ```bash
   firebase deploy --only hosting,functions,firestore:rules
   ```

3. เมื่อแอดมินคนแรกเข้าสู่ระบบ จะให้สิทธิ์คนอื่นเพิ่มได้จากเมนู "ผู้ใช้" ในหน้าแอดมิน

ครั้งแรกที่ API ทำงาน ระบบจะ migrate ข้อมูลเดิมให้อัตโนมัติ: สร้างรอบฉายแบบมีวันที่ 7 วันข้างหน้า ซ่อนรอบเก่าที่ไม่มีวันที่ และตั้งสถานะการจองเดิมเป็น "ชำระแล้ว"

ฟังก์ชัน `releaseExpiredHolds` ทำงานทุก 5 นาทีเพื่อปิดการจองที่ไม่ชำระเงิน (ต้องใช้ Blaze plan ซึ่ง Cloud Functions ต้องใช้อยู่แล้ว) ถ้าไม่ได้ deploy ฟังก์ชันนี้ ที่นั่งก็ยังถูกคืนตามเวลาเพราะ API ตรวจเวลาหมดอายุทุกครั้งที่อ่าน

การส่ง E-Ticket ทางอีเมลต้องติดตั้ง Firebase Extension **Trigger Email** (ตั้ง collection เป็น `mail` และตั้งค่า SMTP) ถ้ายังไม่ติดตั้ง ระบบจะเก็บอีเมลไว้ใน collection `mail` เฉย ๆ

## สถานะและข้อจำกัด

- การชำระเงินใช้ Stripe โหมดทดสอบเท่านั้น หากจะรับเงินจริงต้องยืนยันบัญชี Stripe และเปลี่ยนเป็น live key
- เปิด/ปิดช่องทางชำระเงิน (บัตร, PromptPay ฯลฯ) ได้ที่ Stripe Dashboard → Settings → Payment methods
- ผังที่นั่งเป็นแบบเดียวทุกโรง (24 ที่นั่ง แถว A–D)
- ข้อมูลภาพยนตร์ตั้งต้นและรูปภาพบางส่วนเป็นข้อมูลตัวอย่างจากแหล่งภายนอก

## แนวทางพัฒนาต่อ

- เพิ่ม Stripe webhook เพื่อยืนยันการชำระเงินทันทีแม้ลูกค้าปิดหน้าเว็บ (ตอนนี้ระบบตรวจซ้ำทุก 5 นาที)
- กำหนดผังที่นั่งแยกตามโรงย่อย
- เพิ่ม rate limiting และจำกัด CORS ให้รับเฉพาะโดเมนของเว็บไซต์
- เพิ่ม CI สำหรับรัน `npm test`

## ผู้พัฒนา

พัฒนาโดย [Catboyz-45](https://github.com/Catboyz-45) เพื่อใช้เป็นโปรเจกต์ฝึกพัฒนาเว็บแอปพลิเคชันและประกอบแฟ้มผลงาน
