# Cinema Booking

เว็บแอปพลิเคชันจองตั๋วภาพยนตร์ พัฒนาด้วย HTML, JavaScript, Express และ Firebase เพื่อฝึกสร้างระบบจองตั้งแต่การเลือกภาพยนตร์ รอบฉาย ที่นั่ง ไปจนถึงการยืนยันการจอง

> โปรเจกต์นี้เป็นผลงานระหว่างเรียน รายวิชา 02739322 Information System Analysis and Design

## เกี่ยวกับโปรเจกต์

Cinema Booking ช่วยให้ผู้ใช้ค้นหาภาพยนตร์ ดูรายละเอียดและรอบฉาย เลือกที่นั่ง ตรวจสอบราคา และยืนยันการจองได้ภายในเว็บไซต์เดียว นอกจากนี้ยังมีระบบสมาชิก คะแนนสะสม โปรโมชั่น และหน้าสำหรับตรวจสอบประวัติการจอง

โปรเจกต์นี้แสดงการประยุกต์ใช้ Firebase Authentication และ Cloud Firestore ร่วมกับ REST API บน Express และ Firebase Cloud Functions โดยแยกส่วนหน้าเว็บ ส่วน API และการตั้งค่า deployment ออกจากกันอย่างชัดเจน

## ความสามารถหลัก

- สมัครสมาชิกและเข้าสู่ระบบด้วย Firebase Authentication
- แสดงภาพยนตร์ที่กำลังฉายและโปรแกรมหน้า
- ค้นหาและกรองรายการภาพยนตร์
- แสดงรายละเอียดภาพยนตร์ ตัวอย่าง และข้อมูลรอบฉาย
- เลือกโรงภาพยนตร์ รอบฉาย และที่นั่ง
- แบ่งประเภทที่นั่งเป็น Sofa Pair, Premium และ Regular
- คำนวณราคาตั๋ว ค่าบริการ และส่วนลด
- รองรับโค้ดส่วนลดและการใช้คะแนนสะสม
- ตรวจสอบสถานะที่นั่งและป้องกันการจองที่นั่งซ้ำในระดับข้อมูล
- บันทึกข้อมูลการจองด้วย Cloud Firestore
- แสดงหน้าสรุปและหลักฐานยืนยันการจอง
- แสดงประวัติการจองและข้อมูลสมาชิก
- รองรับหน้าโปรโมชั่น โรงภาพยนตร์ สมาชิก และข้อมูลช่วยเหลือ
- มี REST API สำหรับภาพยนตร์ รอบฉาย ที่นั่ง ผู้ใช้ และการจอง
- รองรับทั้ง Express server สำหรับพัฒนาในเครื่องและ Firebase Hosting สำหรับ deployment

## เทคโนโลยีที่ใช้

| หมวด | เทคโนโลยี |
| --- | --- |
| Frontend | HTML5, JavaScript, Tailwind CSS |
| Backend | Node.js, Express |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Serverless API | Firebase Cloud Functions |
| Hosting | Firebase Hosting |
| Runtime | Node.js 22 สำหรับ Cloud Functions |

## โครงสร้างโปรเจกต์

```text
.
├── public/                         # หน้าเว็บและ JavaScript ฝั่งผู้ใช้
│   ├── index.html                  # หน้าแรกและรายการภาพยนตร์
│   ├── movies.html                 # หน้าค้นหาและเลือกภาพยนตร์
│   ├── movie-details.html          # รายละเอียดภาพยนตร์และรอบฉาย
│   ├── seat-selection.html         # เลือกที่นั่ง
│   ├── checkout.html               # ตรวจสอบราคาและยืนยันการจอง
│   ├── booking-confirmation.html   # สรุปผลการจอง
│   ├── user.html                   # โปรไฟล์และประวัติผู้ใช้
│   ├── auth.js                     # การเชื่อมต่อ Firebase Authentication
│   └── movies-data.js              # ข้อมูลภาพยนตร์สำหรับหน้าเว็บ
├── functions/
│   ├── data/
│   │   └── movies-data.js          # ข้อมูลภาพยนตร์สำหรับ Cloud Functions
│   ├── index.js                    # REST API บน Firebase Cloud Functions
│   └── package.json                # dependencies ของ Functions
├── server.js                       # Express server สำหรับพัฒนาในเครื่อง
├── firebase.json                   # Firebase Hosting และ Functions config
├── .firebaserc                     # Firebase project aliases
├── .env.example                    # ตัวอย่าง environment variables
└── package.json                    # dependencies และคำสั่งของโปรเจกต์
```

## การติดตั้งและรัน

### สิ่งที่ต้องมี

- Node.js เวอร์ชันที่รองรับ dependencies ของโปรเจกต์
- npm
- Firebase CLI หากต้องการใช้ Emulator หรือ deploy
- Firebase project ที่เปิดใช้งาน Authentication, Cloud Firestore, Cloud Functions และ Hosting

โปรเจกต์ตั้งค่า Firebase project เริ่มต้นเป็น `my-web-project-491413` ควรตรวจสอบ project ID ให้ถูกต้องก่อนใช้ Emulator หรือ deploy

### ขั้นตอน

```bash
git clone <repository-url>
cd cinebook-th
npm install
npm run dev
```

จากนั้นเปิด:

```text
http://localhost:3000
```

หากต้องการเชื่อมต่อ Firebase Admin ในเครื่อง ให้กำหนด path ของ service account ผ่าน environment variable ก่อนรันเซิร์ฟเวอร์:

```bash
export FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json
npm run dev
```

ไฟล์ `.env.example` แสดงรายการตัวแปรที่รองรับ ห้าม commit service account, API key ที่เป็นความลับ หรือไฟล์ `.env` ลง repository

## การใช้งาน Firebase

ติดตั้ง dependencies ของ Cloud Functions:

```bash
cd functions
npm install
cd ..
```

เข้าสู่ระบบและตรวจสอบ Firebase project:

```bash
firebase login
firebase use
```

รัน Emulator:

```bash
firebase emulators:start
```

Deploy Hosting และ Functions:

```bash
firebase deploy --only hosting,functions
```

ตรวจสอบชื่อ Firebase project และ environment ที่เลือกก่อน deploy ทุกครั้ง

## การตรวจสอบคุณภาพโค้ด

คำสั่งที่ใช้ตรวจสอบเบื้องต้น:

```bash
node --check server.js
node --check functions/index.js
npm audit
```

สถานะการตรวจล่าสุด:

- JavaScript syntax ของ Express server — ผ่าน
- JavaScript syntax ของ Firebase Functions — ผ่าน
- ตรวจสอบ local links และ assets ใน HTML จำนวน 19 หน้า — ผ่าน
- `npm audit` — ผ่าน ไม่พบช่องโหว่ใน dependencies ระดับ root

โปรเจกต์ยังไม่มี automated test suite จึงควรเพิ่ม unit และ integration tests ก่อนนำไปใช้จริง

## สิ่งที่ได้เรียนรู้

- ออกแบบขั้นตอนการจองตั๋วตั้งแต่เลือกภาพยนตร์จนถึงยืนยันการจอง
- เชื่อมต่อ Firebase Authentication และ Cloud Firestore
- สร้าง REST API ด้วย Express และ Firebase Cloud Functions
- จัดการสถานะที่นั่ง ราคา ส่วนลด และคะแนนสะสม
- แยก frontend, local server และ serverless backend ตามหน้าที่
- ตั้งค่า Firebase Hosting rewrite เพื่อส่งคำขอ `/api` ไปยัง Cloud Functions
- จัดโครงสร้าง repository และป้องกัน credentials ไม่ให้ถูก commit

## สถานะและข้อจำกัด

โปรเจกต์นี้จัดทำขึ้นเพื่อการเรียนรู้และนำเสนอผลงาน ยังไม่ใช่ระบบจำหน่ายตั๋วหรือระบบชำระเงินจริง การ checkout และการยืนยันการจองเป็นขั้นตอนสาธิตเท่านั้น

ก่อนนำไปใช้ใน production ควรเพิ่มการตรวจสอบ Firebase ID token ใน backend, authorization และ record ownership สำหรับทุก endpoint ที่เกี่ยวข้องกับผู้ใช้ ปรับ CORS ให้รับเฉพาะ trusted origins เพิ่ม rate limiting, CSRF protection ตามรูปแบบการยืนยันตัวตน และใช้ transaction หรือ idempotency key กับขั้นตอนการจองที่สำคัญ

ข้อมูลภาพยนตร์และรอบฉายบางส่วนเป็นข้อมูลตัวอย่าง รูปภาพบางรายการอ้างอิงแหล่งภายนอกซึ่งอาจเปลี่ยนแปลงหรือไม่พร้อมใช้งานในอนาคต

## แนวทางพัฒนาต่อ

- เพิ่ม unit tests สำหรับการคำนวณราคา ส่วนลด และคะแนนสะสม
- เพิ่ม integration tests สำหรับ API และ Cloud Firestore
- เพิ่ม end-to-end tests สำหรับขั้นตอนเลือกภาพยนตร์จนถึงยืนยันการจอง
- ตรวจสอบ Firebase ID token และสิทธิ์การเข้าถึงใน backend
- เพิ่ม idempotency key และทดสอบ Firestore transaction ภายใต้การจองพร้อมกันจำนวนมาก
- เพิ่มระบบชำระเงินจริงผ่าน payment provider ที่เชื่อถือได้
- เพิ่มระบบแจ้งเตือนและส่งตั๋วผ่านอีเมล
- เพิ่มแดชบอร์ดสำหรับผู้ดูแลภาพยนตร์ โรง และรอบฉาย
- ปรับ accessibility และ responsive design ให้ครอบคลุมอุปกรณ์มากขึ้น
- เพิ่ม CI สำหรับตรวจ syntax, lint, tests และ dependency audit

## ผู้พัฒนา

พัฒนาโดย [Catboyz-45](https://github.com/Catboyz-45) เพื่อใช้เป็นโปรเจกต์ฝึกพัฒนาเว็บแอปพลิเคชันและประกอบแฟ้มผลงาน
