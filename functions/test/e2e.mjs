// End-to-end API test against the Firebase emulators (project demo-cinema).
// Run from the repository root:  npm test
// (starts fresh emulators, runs this file, then shuts them down)
import { createRequire } from "module";
const require = createRequire(new URL("../package.json", import.meta.url));
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore(initializeApp({ projectId: "demo-cinema" }));

const API = "http://127.0.0.1:5050";
let failures = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!cond) failures += 1;
};

async function signUp(email) {
  const base = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts";
  let r = await fetch(`${base}:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "secret123", returnSecureToken: true }) });
  let j = await r.json();
  if (j.error) {
    r = await fetch(`${base}:signInWithPassword?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "secret123", returnSecureToken: true }) });
    j = await r.json();
  }
  return { token: j.idToken, uid: j.localId, email };
}

async function call(path, { method = "GET", body, user } = {}) {
  const headers = { "content-type": "application/json" };
  if (user) headers.authorization = `Bearer ${user.token}`;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}

const paymentConfig = await call("/api/pricing");
if (paymentConfig.data?.payments?.stripe) {
  console.error("Stripe is enabled in the emulator (functions/.env.local). Remove USE_STRIPE_IN_EMULATOR to run these tests.");
  process.exit(1);
}

const catalog = await call("/api/catalog");
check("catalog loads", catalog.status === 200 && catalog.data.movies.length > 5, `${catalog.data?.movies?.length} movies`);
const movie = catalog.data.movies.find((m) => m.showtimes.length);
const slot = movie.showtimes[0].systems[0].times.at(-1);
check("catalog showtimes have date + id", Boolean(slot.date && slot.showtimeId), JSON.stringify(slot));

const alice = await signUp("alice@cinema.test");
const bob = await signUp("bob@cinema.test");
const admin = await signUp("admin@cinema.test");

check("anonymous /api/users is 401", (await call("/api/users")).status === 401);
check("bad token is 401", (await call("/api/me", { user: { token: "x.y.z" } })).status === 401);
const meA = await call("/api/me", { method: "POST", body: { displayName: "Alice", role: "admin" }, user: alice });
check("profile created with signup bonus, role not injectable", meA.data.loyaltyPoints === 250 && meA.data.role === "customer", JSON.stringify({ p: meA.data.loyaltyPoints, r: meA.data.role }));
await call("/api/me", { method: "POST", body: { displayName: "Bob" }, user: bob });
check("customer cannot list users", (await call("/api/users", { user: alice })).status === 403);
check("customer cannot read another user", (await call(`/api/users/${bob.uid}`, { user: alice })).status === 403);
check("customer blocked from admin API", (await call("/api/admin/summary", { user: alice })).status === 403);

const st = await call(`/api/showtimes/${slot.showtimeId}`);
check("showtime detail has pricing + seats", st.status === 200 && st.data.pricing.seatPrices.Premium === 350 && Array.isArray(st.data.seats.booked));

check("invalid seat rejected", (await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["Z9"] }, user: alice })).status === 400);
check("hold needs login", (await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["A1"] } })).status === 401);
const hold = await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["A1", "B2"] }, user: alice });
check("alice holds A1,B2", hold.status === 201 && hold.data.status === "pending", hold.data?.bookingId);
const bk = hold.data.bookingId;
const bobClash = await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["B2", "B3"] }, user: bob });
check("bob cannot take held seat B2", bobClash.status === 409 && bobClash.data.conflicts?.includes("B2"));
const stBob = await call(`/api/showtimes/${slot.showtimeId}`, { user: bob });
check("held seats visible to others", stBob.data.seats.held.includes("A1"));
check("bob cannot read alice booking", (await call(`/api/bookings/${bk}`, { user: bob })).status === 403);

const prev = await call(`/api/bookings/${bk}/preview`, { method: "POST", body: { promoCode: "free100", usePoints: true }, user: alice });
// A1 500 + B2 350 + fee 40 = 890 - 100 - 30 = 760
check("preview with FREE100 + points = 760", prev.data?.pricing?.total === 760, JSON.stringify(prev.data?.pricing ?? prev.data));
check("bad promo rejected", (await call(`/api/bookings/${bk}/preview`, { method: "POST", body: { promoCode: "NOPE" }, user: alice })).status === 400);

const pay = await call(`/api/bookings/${bk}/pay`, { method: "POST", body: { promoCode: "FREE100", usePoints: true, paymentMethod: "card", cardLast4: "4242" }, user: alice });
check("alice pays", pay.status === 200 && pay.data.status === "paid" && pay.data.pricing.total === 760, pay.data?.message);
check("double pay rejected", (await call(`/api/bookings/${bk}/pay`, { method: "POST", body: { paymentMethod: "card" }, user: alice })).status === 409);
const meA2 = await call("/api/me", { user: alice });
check("points: 250 - 80 + 50 = 220", meA2.data.loyaltyPoints === 220, String(meA2.data.loyaltyPoints));
check("FREE100 marked used", meA2.data.usedPromoCodes?.includes("FREE100"));
const mail = await db.collection("mail").where("bookingId", "==", bk).get();
check("e-ticket email queued", mail.size === 1 && mail.docs[0].data().to === "alice@cinema.test");
const st2 = await call(`/api/showtimes/${slot.showtimeId}`);
check("A1,B2 now booked", ["A1", "B2"].every((s) => st2.data.seats.booked.includes(s)));
const mine = await call("/api/me/bookings", { user: alice });
check("alice sees her booking", mine.data.some((b) => b.bookingId === bk && b.status === "paid"));

// hold replacement + expiry
const h1 = await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["C1"] }, user: bob });
const h2 = await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["C2"] }, user: bob });
const old = await call(`/api/bookings/${h1.data.bookingId}`, { user: bob });
check("new hold replaces bob's old hold", h2.status === 201 && old.data.status === "cancelled");
await db.collection("bookings").doc(h2.data.bookingId).update({ holdExpiresAt: new Date(Date.now() - 1000).toISOString() });
const seatDoc = await db.collection("seatMaps").doc(slot.showtimeId).get();
const holds = seatDoc.data().holds;
holds.C2.expiresAt = Date.now() - 1000;
await db.collection("seatMaps").doc(slot.showtimeId).update({ holds });
const expiredPay = await call(`/api/bookings/${h2.data.bookingId}/pay`, { method: "POST", body: { paymentMethod: "qr" }, user: bob });
check("paying an expired hold fails", expiredPay.status === 409, expiredPay.data?.message);
const aliceTakesC2 = await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["C2"] }, user: alice });
check("expired seat C2 is free again", aliceTakesC2.status === 201);
const cancelOwn = await call(`/api/bookings/${aliceTakesC2.data.bookingId}/cancel`, { method: "POST", user: alice });
check("customer cancels own pending hold", cancelOwn.status === 200);

// admin
const meAdmin = await call("/api/me", { method: "POST", body: { displayName: "Admin" }, user: admin });
check("ADMIN_EMAILS bootstraps admin role", meAdmin.data.role === "admin");
const summary = await call("/api/admin/summary", { user: admin });
check("admin summary", summary.status === 200 && summary.data.todayRevenue === 760, JSON.stringify({ rev: summary.data?.todayRevenue, t: summary.data?.todayTickets }));
const sales = await call("/api/admin/reports/sales?groupBy=day", { user: admin });
check("sales report totals", sales.data.totals.revenue === 760 && sales.data.totals.tickets === 2, JSON.stringify(sales.data.totals));
const monthly = await call("/api/admin/reports/sales?groupBy=month", { user: admin });
check("monthly sales report", monthly.data.rows.length >= 1 && monthly.data.totals.revenue === 760);

// uploaded images
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
check("customer cannot upload images", (await call("/api/admin/images", { method: "POST", body: { dataUrl: `data:image/png;base64,${PNG_1PX}` }, user: alice })).status === 403);
check("non-image upload rejected", (await call("/api/admin/images", { method: "POST", body: { dataUrl: "data:text/html;base64,PGgxPmhpPC9oMT4=" }, user: admin })).status === 400);
check("fake png rejected", (await call("/api/admin/images", { method: "POST", body: { dataUrl: "data:image/png;base64,PGgxPmhpPC9oMT4=" }, user: admin })).status === 400);
const bigJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(720 * 1024)]).toString("base64");
check("oversized image rejected", (await call("/api/admin/images", { method: "POST", body: { dataUrl: `data:image/jpeg;base64,${bigJpeg}` }, user: admin })).status === 413);
const upload = await call("/api/admin/images", { method: "POST", body: { dataUrl: `data:image/png;base64,${PNG_1PX}` }, user: admin });
check("admin uploads image", upload.status === 201 && /^\/api\/images\/[A-Za-z0-9_-]{16,}$/.test(upload.data?.path), JSON.stringify(upload.data));
const imageRes = await fetch(API + upload.data.path);
const imageBytes = Buffer.from(await imageRes.arrayBuffer());
check("uploaded image is served publicly", imageRes.status === 200 && imageRes.headers.get("content-type") === "image/png"
  && imageBytes.equals(Buffer.from(PNG_1PX, "base64")) && /immutable/.test(imageRes.headers.get("cache-control") || ""));
check("unknown image is 404", (await fetch(`${API}/api/images/doesnotexist0000000000`)).status === 404);
const imageMovie = await call("/api/admin/movies", { method: "POST", user: admin, body: { titleThai: "หนังทดสอบรูป", titleEng: "Image Test", durationMinutes: 100, posterImage: API + upload.data.path } });
check("movie accepts uploaded image URL", imageMovie.status === 201 && imageMovie.data.posterImage === API + upload.data.path, imageMovie.data?.message);
await call(`/api/admin/movies/${imageMovie.data.id}`, { method: "PUT", user: admin, body: { titleThai: "หนังทดสอบรูป", durationMinutes: 100, posterImage: "" } });
check("replaced upload is deleted", (await fetch(API + upload.data.path)).status === 404);
await call(`/api/admin/movies/${imageMovie.data.id}`, { method: "DELETE", user: admin });
const byMovie = await call("/api/admin/reports/movies", { user: admin });
check("movie report", byMovie.data.rows[0]?.movieId === movie.id && byMovie.data.rows[0].tickets === 2);
const byShow = await call(`/api/admin/reports/showtimes?date=${slot.date}`, { user: admin });
const row = byShow.data.rows.find((r) => r.showtimeId === slot.showtimeId);
check("showtime seat report", row?.booked === 2 && row.revenue === 760, JSON.stringify(row));
const seatsAdmin = await call(`/api/admin/showtimes/${slot.showtimeId}/seats`, { user: admin });
check("admin seat map links booking", seatsAdmin.data.seats.find((s) => s.code === "A1")?.bookingId === bk);
const search = await call(`/api/admin/bookings?q=alice@cinema.test`, { user: admin });
check("search bookings by email", search.data.some((b) => b.bookingId === bk));

const ci = await call("/api/admin/check-in", { method: "POST", body: { code: pay.data.qrPayload, force: true }, user: admin });
check("check-in via QR payload", ci.status === 200 && ci.data.status === "used", ci.data?.message);
const ci2 = await call("/api/admin/check-in", { method: "POST", body: { code: bk, force: true }, user: admin });
check("second check-in rejected", ci2.status === 409, ci2.data?.message);
check("used ticket cannot be cancelled", (await call(`/api/admin/bookings/${bk}/cancel`, { method: "POST", body: {}, user: admin })).status === 409);

// refund flow
const bh = await call("/api/bookings/hold", { method: "POST", body: { showtimeId: slot.showtimeId, seats: ["D1", "D2"] }, user: bob });
const bp = await call(`/api/bookings/${bh.data.bookingId}/pay`, { method: "POST", body: { paymentMethod: "ewallet", usePoints: true }, user: bob });
check("bob pays with points", bp.data.status === "paid" && bp.data.loyalty.usedPoints === 80);
const refund = await call(`/api/admin/bookings/${bh.data.bookingId}/cancel`, { method: "POST", body: { reason: "ทดสอบคืนเงิน" }, user: admin });
check("admin refund", refund.data.status === "cancelled" && refund.data.payment.status === "refunded", refund.data?.message);
const meB = await call("/api/me", { user: bob });
check("bob points restored to 250", meB.data.loyaltyPoints === 250, String(meB.data.loyaltyPoints));
const st3 = await call(`/api/showtimes/${slot.showtimeId}`);
check("refunded seats freed", !st3.data.seats.booked.includes("D1"));

// movies / showtimes / pricing / promos
const newMovie = await call("/api/admin/movies", { method: "POST", body: { titleThai: "หนังทดสอบ", titleEng: "Test Movie", durationMinutes: 100, genres: "แอ็คชัน, ดราม่า", status: "now_showing" }, user: admin });
check("admin creates movie", newMovie.status === 201 && newMovie.data.id === "test-movie", newMovie.data?.message);
const tomorrow = new Date(Date.now() + 7 * 3600e3 + 86400e3).toISOString().slice(0, 10);
const created = await call("/api/admin/showtimes", { method: "POST", body: { movieId: "test-movie", cinema: "Test Cinema", hall: "Hall 1", format: "Digital 2D", dateFrom: tomorrow, dateTo: tomorrow, times: "10:00, 11:30, 12:00" }, user: admin });
check("showtimes created with overlap skipped", created.data.created?.length === 2 && created.data.skipped?.length === 1, JSON.stringify(created.data.skipped ?? created.data));
const catalog2 = await call("/api/catalog");
check("new movie appears in catalog", catalog2.data.movies.some((m) => m.id === "test-movie" && m.showtimes.length === 1));
const newSt = created.data.created[0].id;
const moved = await call(`/api/admin/showtimes/${newSt}`, { method: "PUT", body: { startTime: "12:30" }, user: admin });
check("moving into an overlapping slot is rejected", moved.status === 409, moved.data?.message);
check("delete showtime without bookings", (await call(`/api/admin/showtimes/${newSt}`, { method: "DELETE", user: admin })).status === 200);
check("cannot delete showtime with bookings", (await call(`/api/admin/showtimes/${slot.showtimeId}`, { method: "DELETE", user: admin })).status === 409);
const del = await call("/api/admin/movies/test-movie", { method: "DELETE", user: admin });
check("delete movie without bookings", del.data.deleted === true);
const archive = await call(`/api/admin/movies/${movie.id}`, { method: "DELETE", user: admin });
check("movie with bookings is archived instead", archive.data.archived === true);
await call(`/api/admin/movies/${movie.id}`, { method: "PUT", body: { ...movie, status: "now_showing" }, user: admin });

const pricing = await call("/api/admin/settings/pricing", { method: "PUT", body: { seatPrices: { "Sofa Pair": 550, Premium: 360, Regular: 250 }, serviceFeePerSeat: 25, holdMinutes: 10, loyalty: { signupBonus: 250, pointsRequired: 80, pointDiscount: 30, pointsEarnedPerBooking: 50 } }, user: admin });
check("pricing updated", pricing.data.seatPrices.Premium === 360);
const pub = await call("/api/pricing");
check("public pricing reflects update", pub.data.seatPrices.Regular === 250 && pub.data.serviceFeePerSeat === 25);
await call("/api/admin/settings/pricing", { method: "PUT", body: { seatPrices: { "Sofa Pair": 500, Premium: 350, Regular: 240 }, serviceFeePerSeat: 20, holdMinutes: 12 }, user: admin });

const promo = await call("/api/admin/promotions", { method: "POST", body: { code: "half50", description: "ลด 50%", discountType: "percent", discountValue: 50 }, user: admin });
check("admin creates promo", promo.status === 201 && promo.data.code === "HALF50");
const role = await call(`/api/admin/users/${bob.uid}/role`, { method: "PUT", body: { role: "admin" }, user: admin });
check("admin can promote user", role.data.role === "admin");
await call(`/api/admin/users/${bob.uid}/role`, { method: "PUT", body: { role: "customer" }, user: admin });

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
