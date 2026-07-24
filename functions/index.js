const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const express = require("express");
const cors = require("cors");

// ---- Firebase Init ----
if (getApps().length === 0) {
  initializeApp();
}
const firestore = getFirestore();

setGlobalOptions({ maxInstances: 10, region: "asia-southeast1" });

// ---- Load the movie catalog bundled with Cloud Functions ----
let moviesDatabase = {};
let additionalMovies = {};
try {
  const moviesData = require("./data/movies-data.js");
  moviesDatabase = moviesData.moviesDatabase || {};
  additionalMovies = moviesData.additionalMovies || {};
  console.log("movies-data.js loaded successfully");
} catch (e) {
  console.warn("movies-data.js not found, using fallback data:", e.message);
}

// ---- Express App ----
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ---- Constants ----
const PRICE_BY_TYPE = { "Sofa Pair": 500, Premium: 350, Regular: 240 };
const SEAT_TYPE_BY_PREFIX = { A: "Sofa Pair", B: "Premium", C: "Regular", D: "Regular" };
const SERVICE_FEE_PER_SEAT = 20;
const DEFAULT_LOYALTY_POINTS = 250;
const POINTS_REQUIRED_FOR_DISCOUNT = 80;
const POINT_DISCOUNT_BAHT = 30;
const POINTS_EARNED_PER_BOOKING = 50;
const LEGACY_BLOCKED_SEATS = new Set(["A3", "B6", "B7"]);
const PROMO_CODE_CONFIG = {
  FREE100: { discount: 100, mondayOnly: false },
  MONDAY100: { discount: 100, mondayOnly: true },
};

// ---- In-memory fallback data ----
const db = {
  users: [],
  movies: [
    { id: "avatar-way-of-water", title: "Avatar: The Way of Water", cinema: "Paragon Cineplex", hall: "Theater 5 (IMAX)", language: "EN/TH", format: "IMAX 3D", durationMinutes: 192, poster: "https://lh3.googleusercontent.com/aida-public/AB6AXuCANR7ambYBR6NXFdSYijpzzYbGMNLe81-D_p3STHCeidvznIriLF52eydEwmMJNUnnmgf2ydgpWSKFWsC69YpHpjXgFN9sbgsFuthwxKBoD7u2ZzhMGBYhJtXmAAPKHXOq11V70Te69Su1RV13Ret1Wt8nmCT10nyjCl_m51WeU2vDidDlwHq5Bws5XmOmy5arPF1HeNBXLoYbO7_V-sbZSf9so43ybVebWdDHxsStSf1gv7q2UlNxDS7kmQLHzz6eWaYlDyximxJN" },
    { id: "death-whisperer-2", title: "ธี่หยด 2", cinema: "Paragon Cineplex", hall: "Hall 1", language: "TH/EN SUB", format: "IMAX", durationMinutes: 125, poster: "https://lh3.googleusercontent.com/aida-public/AB6AXuASMj5eZTFJZJs9CywraW3SS7EjRRxBBEHqp-Y19NWauJrymZaNn1rXaEBcJQPTmnFDhF7-p6IIwNd7AQa6xtFWoImsrofyxVANdSPqev0LFMGsYGtKLktvAmYxrQAh7SAmvSUcuhxed8VZqLbtnuVBw9ocFdQcmk0jMeZlAJDbIk3YjSTlLfLNvQWmrF_OisbgJslncTjKUzc3oTfExAOGztOdWazgvwZYKGiLfTAsGiHOAPFMZ5QUH" },
    { id: "the-marvels", title: "The Marvels", cinema: "Icon Siam Cineplex", hall: "Hall 2", language: "TH/EN SUB", format: "IMAX", durationMinutes: 105, poster: "https://lh3.googleusercontent.com/aida-public/AB6AXuC4LF9j0wT5oJ1xXpQ2z9KqL3m4MdN7p2s8t0r5vW6a7bXyZ0cDeFgHiJkL1mNoPqRsT" },
    { id: "hunger-games", title: "The Hunger Games", cinema: "Paragon Cineplex", hall: "Hall 3", language: "TH/EN SUB", format: "4DX", durationMinutes: 158 },
    { id: "killers-of-the-flower-moon", title: "Killers of the Flower Moon", cinema: "Major Cineplex Sukhumvit", hall: "Theater 4", language: "EN SUB", format: "Standard 2D", durationMinutes: 206 },
    { id: "trolls-band-together", title: "Trolls Band Together", cinema: "Icon Siam Cineplex", hall: "Hall 1", language: "TH", format: "Standard 2D", durationMinutes: 92 },
  ],
  showtimes: [
    { id: "st-avatar-1430", movieId: "avatar-way-of-water", dateLabel: "วันนี้", startTime: "14:30", endTime: "17:42" },
    { id: "st-death-whisperer-2-1030-hall-1", movieId: "death-whisperer-2", dateLabel: "วันนี้", startTime: "10:30", endTime: "12:35" },
    { id: "st-the-marvels-1100-hall-2", movieId: "the-marvels", dateLabel: "วันนี้", startTime: "11:00", endTime: "12:45" },
    { id: "st-hunger-games-1000-hall-3", movieId: "hunger-games", dateLabel: "วันนี้", startTime: "10:00", endTime: "12:38" },
    { id: "st-killers-of-the-flower-moon-1030-theater-4", movieId: "killers-of-the-flower-moon", dateLabel: "วันนี้", startTime: "10:30", endTime: "13:56" },
    { id: "st-trolls-band-together-0930-hall-1", movieId: "trolls-band-together", dateLabel: "วันนี้", startTime: "09:30", endTime: "11:02" },
  ],
  seatsByShowtime: {
    "st-avatar-1430": { sold: [], booked: [] },
    "st-death-whisperer-2-1030-hall-1": { sold: [], booked: [] },
    "st-the-marvels-1100-hall-2": { sold: [], booked: [] },
    "st-hunger-games-1000-hall-3": { sold: [], booked: [] },
    "st-killers-of-the-flower-moon-1030-theater-4": { sold: [], booked: [] },
    "st-trolls-band-together-0930-hall-1": { sold: [], booked: [] },
  },
  bookings: {},
};

// ---- Helper Functions ----
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function defaultPromoCodeStatus() {
  return Object.keys(PROMO_CODE_CONFIG).reduce((acc, code) => { acc[code] = 1; return acc; }, {});
}

function normalizePromoCodeStatus(status = {}) {
  const base = defaultPromoCodeStatus();
  for (const code of Object.keys(base)) {
    if (String(status?.[code]) === "0" || Number(status?.[code]) === 0) base[code] = 0;
  }
  return base;
}

function normalizePromoCodeInput(rawCode = "") {
  return String(rawCode || "").trim().toUpperCase();
}

function validatePromoCodeRules(code) {
  if (!code) return { ok: true };
  const config = PROMO_CODE_CONFIG[code];
  if (!config) return { ok: false, message: "โค้ดไม่ถูกต้อง" };
  if (config.mondayOnly && new Date().getDay() !== 1) return { ok: false, message: "โค้ด MONDAY100 ใช้ได้เฉพาะวันจันทร์" };
  return { ok: true, config };
}

function normalizeUserProfile(profile = {}) {
  return {
    ...profile,
    loyaltyPoints: Number.isFinite(Number(profile.loyaltyPoints)) ? Number(profile.loyaltyPoints) : DEFAULT_LOYALTY_POINTS,
    promoCodeStatus: normalizePromoCodeStatus(profile.promoCodeStatus || {}),
  };
}

function getSeatType(seatCode) {
  const rowPrefix = seatCode?.charAt(0)?.toUpperCase();
  return SEAT_TYPE_BY_PREFIX[rowPrefix] || "Regular";
}

function calculatePricing({ seats, promoCode, promoDiscount = 0, usePoints, availablePoints = 0 }) {
  const lines = seats.map((seatCode) => {
    const type = getSeatType(seatCode);
    const unitPrice = PRICE_BY_TYPE[type] ?? 240;
    return { seatCode, type, unitPrice };
  });
  const seatSubtotal = lines.reduce((sum, item) => sum + item.unitPrice, 0);
  const serviceFee = seats.length * SERVICE_FEE_PER_SEAT;
  let discount = Math.min(Number(promoDiscount || 0), seatSubtotal + serviceFee);
  const canUsePoints = Boolean(usePoints) && Number(availablePoints) >= POINTS_REQUIRED_FOR_DISCOUNT;
  if (canUsePoints) discount += Math.min(POINT_DISCOUNT_BAHT, seatSubtotal + serviceFee - discount);
  const total = Math.max(0, seatSubtotal + serviceFee - discount);
  return { lines, seatSubtotal, serviceFee, discount, total };
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function slugToTitle(slug = "") {
  return slug.split("-").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function parseDynamicShowtimeId(showtimeId = "") {
  const match = /^st-(.+)-(\d{4})-(.+)$/.exec(showtimeId);
  if (!match) return null;
  return {
    movieId: match[1],
    startTime: `${match[2].slice(0, 2)}:${match[2].slice(2)}`,
    hall: match[3].split("-").map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" "),
  };
}

function addMinutesToTime(startTime = "10:00", minutes = 120) {
  const [h, m] = startTime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const end = h * 60 + m + Number(minutes || 120);
  return `${String(Math.floor((end % 1440) / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

// ---- DB Access Functions ----
async function getMovieById(movieId) {
  const snap = await firestore.collection("movies").doc(movieId).get();
  if (snap.exists) return snap.data();
  return db.movies.find((m) => m.id === movieId) || null;
}

async function getMovies() {
  const snaps = await firestore.collection("movies").get();
  if (!snaps.empty) return snaps.docs.map((d) => d.data());
  return db.movies;
}

async function getShowtimeById(showtimeId) {
  const snap = await firestore.collection("showtimes").doc(showtimeId).get();
  if (snap.exists) return snap.data();
  return db.showtimes.find((s) => s.id === showtimeId) || null;
}

async function resolveMovie(movieId) {
  const movie = await getMovieById(movieId);
  if (movie) return movie;
  return { id: movieId, title: slugToTitle(movieId), cinema: "Paragon Cineplex", hall: "Hall 1", language: "TH/EN SUB", format: "Digital 2D", durationMinutes: 120, poster: `https://picsum.photos/seed/${encodeURIComponent(movieId)}/600/900` };
}

async function resolveShowtime(showtimeId) {
  const showtime = await getShowtimeById(showtimeId);
  if (showtime) return showtime;
  const parsed = parseDynamicShowtimeId(showtimeId);
  if (!parsed) return null;
  const movie = await resolveMovie(parsed.movieId);
  return { id: showtimeId, movieId: parsed.movieId, dateLabel: "วันนี้", startTime: parsed.startTime, endTime: addMinutesToTime(parsed.startTime, movie.durationMinutes || 120), hall: parsed.hall };
}

async function getSeatState(showtimeId) {
  const snap = await firestore.collection("seatMaps").doc(showtimeId).get();
  if (!snap.exists) return null;
  const current = snap.data() || {};
  return {
    sold: Array.isArray(current.sold) ? current.sold.filter((s) => !LEGACY_BLOCKED_SEATS.has(s)) : [],
    booked: Array.isArray(current.booked) ? current.booked : [],
  };
}

async function ensureSeatState(showtimeId) {
  const existing = await getSeatState(showtimeId);
  if (existing) return existing;
  const defaultState = { sold: [], booked: [] };
  await firestore.collection("seatMaps").doc(showtimeId).set(defaultState, { merge: true });
  return defaultState;
}

async function getUserProfileByUid(uid) {
  if (!uid) return null;
  const snap = await firestore.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return normalizeUserProfile(snap.data());
}

async function upsertUserProfile(profile) {
  const normalized = normalizeUserProfile(profile);
  await firestore.collection("users").doc(normalized.uid).set(normalized, { merge: true });
  return normalized;
}

async function applyUserPoints(uid, { earnedPoints = 0, usedPoints = 0 } = {}) {
  if (!uid) return null;
  const userRef = firestore.collection("users").doc(uid);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const existing = snap.exists ? normalizeUserProfile(snap.data()) : normalizeUserProfile({ uid, loyaltyPoints: DEFAULT_LOYALTY_POINTS });
    const nextPoints = Math.max(0, existing.loyaltyPoints - usedPoints + earnedPoints);
    const payload = { ...existing, uid, loyaltyPoints: nextPoints, updatedAt: new Date().toISOString() };
    tx.set(userRef, payload, { merge: true });
    return payload;
  });
}

async function validatePromoCodeForUser(uid, rawCode) {
  const code = normalizePromoCodeInput(rawCode);
  if (!code) return { ok: true, code: "", discount: 0 };
  if (!uid) return { ok: false, message: "กรุณาเข้าสู่ระบบก่อนใช้โค้ด" };
  const ruleResult = validatePromoCodeRules(code);
  if (!ruleResult.ok) return { ok: false, message: ruleResult.message };
  const profile = await getUserProfileByUid(uid);
  if (!profile) return { ok: false, message: "ไม่พบข้อมูลผู้ใช้สำหรับใช้โค้ด" };
  const status = normalizePromoCodeStatus(profile.promoCodeStatus || {});
  if (status[code] !== 1) return { ok: false, message: "โค้ดนี้ถูกใช้ไปแล้ว" };
  return { ok: true, code, discount: Number(ruleResult.config?.discount || 0) };
}

async function consumePromoCodeForUser(uid, code) {
  const normalizedCode = normalizePromoCodeInput(code);
  if (!normalizedCode) return { ok: true };
  if (!uid) return { ok: false, message: "กรุณาเข้าสู่ระบบก่อนใช้โค้ด" };
  const ruleResult = validatePromoCodeRules(normalizedCode);
  if (!ruleResult.ok) return { ok: false, message: ruleResult.message };
  const userRef = firestore.collection("users").doc(uid);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return { ok: false, message: "ไม่พบข้อมูลผู้ใช้สำหรับใช้โค้ด" };
    const profile = normalizeUserProfile(snap.data());
    if ((profile.promoCodeStatus || {})[normalizedCode] !== 1) return { ok: false, message: "โค้ดนี้ถูกใช้ไปแล้ว" };
    tx.set(userRef, { promoCodeStatus: { ...(profile.promoCodeStatus || {}), [normalizedCode]: 0 }, updatedAt: new Date().toISOString() }, { merge: true });
    return { ok: true };
  });
}

async function saveBooking(booking) {
  await firestore.collection("bookings").doc(booking.bookingId).set(booking);
}

async function getBookingById(bookingId) {
  const snap = await firestore.collection("bookings").doc(bookingId).get();
  if (snap.exists) return snap.data();
  return null;
}

async function reserveSeats(showtimeId, seats) {
  await ensureSeatState(showtimeId);
  const seatRef = firestore.collection("seatMaps").doc(showtimeId);
  return firestore.runTransaction(async (tx) => {
    const seatDoc = await tx.get(seatRef);
    const raw = seatDoc.exists ? seatDoc.data() : { sold: [], booked: [] };
    const seatState = {
      sold: Array.isArray(raw.sold) ? raw.sold.filter((s) => !LEGACY_BLOCKED_SEATS.has(s)) : [],
      booked: Array.isArray(raw.booked) ? raw.booked : [],
    };
    const blockedSet = new Set([...seatState.sold, ...seatState.booked]);
    const conflicts = seats.filter((s) => blockedSet.has(s));
    if (conflicts.length > 0) return { ok: false, conflicts };
    tx.update(seatRef, { booked: FieldValue.arrayUnion(...seats) });
    return { ok: true, conflicts: [] };
  });
}

// ---- Seed Data ----
async function seedFirebaseData() {
  const allMovies = { ...moviesDatabase, ...additionalMovies };
  const hasExternalMovies = Object.keys(allMovies).length > 0;

  if (hasExternalMovies) {
    for (const movieId of Object.keys(allMovies)) {
      const movie = allMovies[movieId];
      if (!movie || !movie.id) continue;
      const ref = firestore.collection("movies").doc(movie.id);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(movie);
        console.log(`Seeded movie: ${movie.titleEng || movie.titleThai || movie.id}`);
      }
    }
    for (const movieId of Object.keys(allMovies)) {
      const movie = allMovies[movieId];
      if (!movie || !movie.showtimes) continue;
      for (const system of movie.showtimes) {
        for (const format of system.systems || []) {
          for (const timeObj of format.times || []) {
            const hallSlug = timeObj.hall.toLowerCase().replace(/\s+/g, "-");
            const showtimeId = `st-${movie.id}-${timeObj.time.replace(":", "")}-${hallSlug}`;
            const ref = firestore.collection("showtimes").doc(showtimeId);
            const snap = await ref.get();
            if (!snap.exists) {
              await ref.set({ id: showtimeId, movieId: movie.id, dateLabel: "วันนี้", startTime: timeObj.time, endTime: addMinutesToTime(timeObj.time, movie.durationMinutes || 120), hall: timeObj.hall });
            }
          }
        }
      }
    }
  } else {
    for (const movie of db.movies) {
      const ref = firestore.collection("movies").doc(movie.id);
      const snap = await ref.get();
      if (!snap.exists) await ref.set(movie);
    }
    for (const showtime of db.showtimes) {
      const ref = firestore.collection("showtimes").doc(showtime.id);
      const snap = await ref.get();
      if (!snap.exists) await ref.set(showtime);
    }
  }

  const showtimeSnaps = await firestore.collection("showtimes").get();
  for (const doc of showtimeSnaps.docs) {
    const ref = firestore.collection("seatMaps").doc(doc.id);
    const snap = await ref.get();
    if (!snap.exists) await ref.set({ sold: [], booked: [] });
  }
}

// ---- API Routes (ใช้ router เพื่อให้มี /api นำหน้าทุก route) ----
const router = express.Router();

router.get("/health", (_req, res) => res.json({ ok: true, message: "Cinema API running on Firebase Functions" }));

router.get("/movies", asyncHandler(async (_req, res) => res.json(await getMovies())));

router.get("/movies/:movieId", asyncHandler(async (req, res) => {
  const movie = await getMovieById(req.params.movieId);
  if (!movie) return res.status(404).json({ message: "Movie not found" });
  return res.json(movie);
}));

router.get("/showtimes/:showtimeId", asyncHandler(async (req, res) => {
  const showtime = await resolveShowtime(req.params.showtimeId);
  if (!showtime) return res.status(404).json({ message: "Showtime not found" });
  const movie = await resolveMovie(showtime.movieId);
  return res.json({ ...showtime, movie });
}));

router.get("/seats/:showtimeId", asyncHandler(async (req, res) => {
  const seatState = await ensureSeatState(req.params.showtimeId);
  return res.json(seatState);
}));

router.post("/checkout/preview", asyncHandler(async (req, res) => {
  const { showtimeId, seats = [], promoCode = "", usePoints = false, uid = null } = req.body;
  if (!showtimeId || !Array.isArray(seats) || seats.length === 0)
    return res.status(400).json({ message: "showtimeId and seats are required" });
  const showtime = await resolveShowtime(showtimeId);
  if (!showtime) return res.status(404).json({ message: "Showtime not found" });
  const seatState = await ensureSeatState(showtimeId);
  const blockedSet = new Set([...(seatState?.sold || []), ...(seatState?.booked || [])]);
  const conflicts = seats.filter((s) => blockedSet.has(s));
  if (conflicts.length > 0) return res.status(409).json({ message: "Some seats are no longer available", conflicts });
  const userProfile = uid ? await getUserProfileByUid(uid) : null;
  const availablePoints = userProfile?.loyaltyPoints ?? 0;
  const canUsePoints = availablePoints >= POINTS_REQUIRED_FOR_DISCOUNT;
  const effectiveUsePoints = Boolean(usePoints) && canUsePoints;
  const promoValidation = await validatePromoCodeForUser(uid, promoCode);
  if (!promoValidation.ok) return res.status(400).json({ message: promoValidation.message });
  const pricing = calculatePricing({ seats, promoCode: promoValidation.code, promoDiscount: promoValidation.discount, usePoints: effectiveUsePoints, availablePoints });
  const movie = await resolveMovie(showtime.movieId);
  return res.json({ showtime, movie, seats, pricing, promoCode: promoValidation.code, usePoints: effectiveUsePoints, loyalty: { availablePoints, canUsePoints, pointsRequired: POINTS_REQUIRED_FOR_DISCOUNT } });
}));

router.post("/bookings", asyncHandler(async (req, res) => {
  const { showtimeId, seats = [], promoCode = "", usePoints = false, paymentMethod = "credit-card", cardLast4 = "0000", uid = null } = req.body;
  if (!showtimeId || !Array.isArray(seats) || seats.length === 0)
    return res.status(400).json({ message: "showtimeId and seats are required" });
  const showtime = await resolveShowtime(showtimeId);
  if (!showtime) return res.status(404).json({ message: "Showtime not found" });
  const promoValidation = await validatePromoCodeForUser(uid, promoCode);
  if (!promoValidation.ok) return res.status(400).json({ message: promoValidation.message });
  const reserveResult = await reserveSeats(showtimeId, seats);
  if (!reserveResult.ok) return res.status(409).json({ message: "Some seats are no longer available", conflicts: reserveResult.conflicts });
  const userProfile = uid ? await getUserProfileByUid(uid) : null;
  const availablePoints = userProfile?.loyaltyPoints ?? 0;
  const canUsePoints = availablePoints >= POINTS_REQUIRED_FOR_DISCOUNT;
  const effectiveUsePoints = Boolean(usePoints) && canUsePoints;
  const usedPoints = effectiveUsePoints ? POINTS_REQUIRED_FOR_DISCOUNT : 0;
  const pricing = calculatePricing({ seats, promoCode: promoValidation.code, promoDiscount: promoValidation.discount, usePoints: effectiveUsePoints, availablePoints });
  const promoConsumeResult = await consumePromoCodeForUser(uid, promoValidation.code);
  if (!promoConsumeResult.ok) return res.status(400).json({ message: promoConsumeResult.message });
  const bookingId = randomId("BK");
  const movie = await resolveMovie(showtime.movieId);
  const earnedPoints = uid ? POINTS_EARNED_PER_BOOKING : 0;
  const booking = {
    bookingId, uid: uid || null, movie, showtime, seats, pricing,
    payment: { method: paymentMethod, cardLast4 },
    loyalty: { earnedPoints, usedPoints },
    promotion: { code: promoValidation.code || null, discount: promoValidation.discount || 0 },
    createdAt: new Date().toISOString(),
    qrPayload: `cinema:${bookingId}:${showtimeId}:${seats.join(",")}`,
  };
  await saveBooking(booking);
  let updatedUserProfile = null;
  if (uid) updatedUserProfile = await applyUserPoints(uid, { earnedPoints, usedPoints });
  if (updatedUserProfile) booking.loyalty.balanceAfterBooking = updatedUserProfile.loyaltyPoints;
  return res.status(201).json(booking);
}));

router.get("/bookings/:bookingId", asyncHandler(async (req, res) => {
  const booking = await getBookingById(req.params.bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  return res.json(booking);
}));

router.get("/users/:uid/bookings", asyncHandler(async (req, res) => {
  const snapshot = await firestore.collection("bookings").where("uid", "==", req.params.uid).get();
  return res.json(snapshot.docs.map((d) => d.data()));
}));

router.get("/users/:uid", asyncHandler(async (req, res) => {
  const user = await getUserProfileByUid(req.params.uid);
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json(user);
}));

router.post("/users", asyncHandler(async (req, res) => {
  const { uid, email, displayName } = req.body;
  if (!uid || !email) return res.status(400).json({ message: "uid and email are required" });
  const existing = await getUserProfileByUid(uid);
  const now = new Date().toISOString();
  const userProfile = { uid, email, displayName: displayName || "ผู้ใช้", loyaltyPoints: existing?.loyaltyPoints ?? DEFAULT_LOYALTY_POINTS, createdAt: existing?.createdAt || now, updatedAt: now };
  const saved = await upsertUserProfile(userProfile);
  return res.status(201).json(saved);
}));

router.get("/users", asyncHandler(async (_req, res) => {
  const snapshot = await firestore.collection("users").get();
  return res.json(snapshot.docs.map((d) => d.data()));
}));

app.use("/api", router);

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error);
  res.status(500).json({ message: "Internal server error" });
});

// ---- Seed & Export ----
seedFirebaseData().catch((err) => console.warn("Seed warning:", err?.message));

exports.api = onRequest({ invoker: "public" }, app);
