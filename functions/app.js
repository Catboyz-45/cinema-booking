/**
 * Cinema Booking REST API (shared by Firebase Functions and the local Express server).
 *
 * Public:    /api/catalog, /api/movies, /api/showtimes/:id, /api/seats/:id, /api/pricing, /api/promotions
 * Customer:  /api/me, /api/me/bookings, /api/bookings/hold, /api/bookings/:id/(preview|pay|cancel)
 * Admin:     /api/admin/...  (requires users/{uid}.role === "admin")
 */
const express = require("express");
const cors = require("cors");
const { createStore, readSeatState, effectiveStatus, presentBooking, movieTitle } = require("./lib/store");
const { runSeed } = require("./lib/seed");
const {
  HttpError,
  asyncHandler,
  todayInBangkok,
  isValidDate,
  isValidTime,
  addDays,
  dateRange,
  bangkokToUtcIso,
  showtimeStartsAt,
  timeToMinutes,
  minutesToTime,
  formatDuration,
  slugify,
  cleanString,
  toStringList,
} = require("./lib/util");
const {
  SEAT_ROWS,
  SEAT_TYPE_BY_CODE,
  HALL_CAPACITY,
  SHOWTIME_CLEANUP_MINUTES,
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  REVENUE_STATUSES,
  MOVIE_STATUSES,
  normalizePricing,
  validateSeats,
} = require("./lib/domain");
const { showtimeIdFor } = require("./lib/seed");
const { STRIPE_HOLD_MINUTES } = require("./lib/payments");

const CATALOG_DAYS = 14;

function parseAdminEmails(value) {
  return new Set(String(value || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

function isHttpsUrl(value) {
  return value === "" || /^https:\/\/[^\s"'<>]+$/i.test(value);
}

function createApp({ firestore, verifyIdToken, payments = null, adminEmails = process.env.ADMIN_EMAILS, logger = console }) {
  const app = express();
  const store = createStore(firestore, { payments });
  const col = store.col;
  const bootstrapAdmins = parseAdminEmails(adminEmails);

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "200kb" }));

  // ---- one-time seed / migration (runs on the first request of an instance) ----
  let seedPromise = null;
  const ensureSeeded = () => {
    if (!seedPromise) {
      seedPromise = runSeed(firestore, { logger }).catch((error) => {
        seedPromise = null;
        throw error;
      });
    }
    return seedPromise;
  };

  // ---- auth ----
  async function authenticate(req, _res, next) {
    req.user = null;
    const header = req.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return next();
    try {
      const decoded = await verifyIdToken(match[1]);
      req.user = { uid: decoded.uid, email: (decoded.email || "").toLowerCase(), name: decoded.name || "" };
      return next();
    } catch (_error) {
      return next(new HttpError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"));
    }
  }

  function requireAuth(req, _res, next) {
    if (!req.user) return next(new HttpError(401, "กรุณาเข้าสู่ระบบก่อน"));
    return next();
  }

  async function loadRole(req) {
    if (!req.user) return "guest";
    if (req.role) return req.role;
    const user = await store.getUser(req.user.uid);
    let role = user?.role || "customer";
    if (role !== "admin" && req.user.email && bootstrapAdmins.has(req.user.email)) {
      role = "admin";
      await col("users").doc(req.user.uid).set({ uid: req.user.uid, email: req.user.email, role }, { merge: true });
    }
    req.role = role;
    return role;
  }

  const requireAdmin = asyncHandler(async (req, _res, next) => {
    if (!req.user) throw new HttpError(401, "กรุณาเข้าสู่ระบบก่อน");
    if ((await loadRole(req)) !== "admin") throw new HttpError(403, "เฉพาะผู้ดูแลระบบเท่านั้น");
    next();
  });

  async function assertSelfOrAdmin(req, uid) {
    if (!req.user) throw new HttpError(401, "กรุณาเข้าสู่ระบบก่อน");
    if (req.user.uid === uid) return;
    if ((await loadRole(req)) !== "admin") throw new HttpError(403, "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }

  // ---- shared queries ----
  async function getMoviesMap() {
    const snaps = await col("movies").get();
    const map = {};
    snaps.docs.forEach((doc) => { map[doc.id] = { id: doc.id, ...doc.data() }; });
    return map;
  }

  async function getCinemasMap() {
    const snaps = await col("cinemas").get();
    const map = {};
    snaps.docs.forEach((doc) => { map[doc.data().name] = doc.data(); });
    return map;
  }

  async function showtimesBetween(from, to) {
    const snaps = await col("showtimes").where("date", ">=", from).where("date", "<=", to).get();
    return snaps.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async function bookingsForShowtime(showtimeId) {
    const snaps = await col("bookings").where("showtimeId", "==", showtimeId).get();
    return snaps.docs.map((doc) => presentBooking(doc.data()));
  }

  async function bookingsPaidBetween(from, to) {
    const snaps = await col("bookings")
      .where("paidAt", ">=", bangkokToUtcIso(from))
      .where("paidAt", "<", bangkokToUtcIso(addDays(to, 1)))
      .get();
    return snaps.docs.map((doc) => presentBooking(doc.data())).filter((b) => REVENUE_STATUSES.includes(b.status));
  }

  function groupShowtimesForCatalog(showtimes, cinemas) {
    const byCinema = new Map();
    const sorted = [...showtimes].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    for (const st of sorted) {
      if (!byCinema.has(st.cinema)) {
        const info = cinemas[st.cinema] || {};
        byCinema.set(st.cinema, { cinema: st.cinema, distance: info.distance || "", amenities: info.amenities || [], systems: new Map() });
      }
      const group = byCinema.get(st.cinema);
      const key = `${st.format}|${st.type}`;
      if (!group.systems.has(key)) group.systems.set(key, { format: st.format, type: st.type, times: [] });
      group.systems.get(key).times.push({ time: st.startTime, endTime: st.endTime, hall: st.hall, date: st.date, showtimeId: st.id });
    }
    return [...byCinema.values()].map((group) => ({ ...group, systems: [...group.systems.values()] }));
  }

  function hasOverlap(candidate, others) {
    const start = timeToMinutes(candidate.startTime);
    const end = start + candidate.durationMinutes + SHOWTIME_CLEANUP_MINUTES;
    return others.find((other) => {
      const oStart = timeToMinutes(other.startTime);
      const oEnd = (other.endTime ? timeToMinutes(other.endTime) : oStart + 120) + SHOWTIME_CLEANUP_MINUTES;
      const oEndFixed = oEnd < oStart ? oEnd + 1440 : oEnd;
      return start < oEndFixed && oStart < end;
    }) || null;
  }

  async function activeShowtimesInHall(date, cinema, hall, excludeId = null) {
    const snaps = await col("showtimes").where("date", "==", date).get();
    return snaps.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((st) => st.id !== excludeId && st.cinema === cinema && st.hall === hall && (st.status || "active") === "active");
  }

  // =========================================================================
  // Routers
  // =========================================================================
  const api = express.Router();
  api.use(asyncHandler(async (_req, _res, next) => { await ensureSeeded(); next(); }));
  api.use(authenticate);

  api.get("/health", (_req, res) => res.json({ ok: true, message: "Cinema API running" }));

  // ---- public catalog ----
  api.get("/catalog", asyncHandler(async (_req, res) => {
    const today = todayInBangkok();
    const [movies, cinemas, showtimes] = await Promise.all([
      getMoviesMap(),
      getCinemasMap(),
      showtimesBetween(today, addDays(today, CATALOG_DAYS - 1)),
    ]);
    const nowMs = Date.now();
    const upcoming = showtimes.filter((st) => (st.status || "active") === "active" && showtimeStartsAt(st)?.getTime() > nowMs);
    const byMovie = {};
    upcoming.forEach((st) => { (byMovie[st.movieId] = byMovie[st.movieId] || []).push(st); });
    const list = Object.values(movies)
      .filter((movie) => movie.status !== "archived")
      .map((movie) => ({
        ...movie,
        duration: movie.duration || formatDuration(movie.durationMinutes || 120),
        genres: movie.genres || [],
        cast: movie.cast || [],
        showtimes: groupShowtimesForCatalog(byMovie[movie.id] || [], cinemas),
      }));
    res.set("Cache-Control", "no-store");
    res.json({ today, dates: dateRange(today, addDays(today, CATALOG_DAYS - 1)), movies: list });
  }));

  api.get("/movies", asyncHandler(async (_req, res) => {
    const movies = await getMoviesMap();
    res.json(Object.values(movies).filter((m) => m.status !== "archived"));
  }));

  api.get("/movies/:movieId", asyncHandler(async (req, res) => {
    const snap = await col("movies").doc(req.params.movieId).get();
    if (!snap.exists) throw new HttpError(404, "Movie not found");
    res.json({ id: snap.id, ...snap.data() });
  }));

  api.get("/pricing", asyncHandler(async (_req, res) => {
    const pricing = await store.getPricing();
    res.json({ ...pricing, seatRows: SEAT_ROWS, payments: { stripe: Boolean(payments?.enabled) } });
  }));

  api.get("/promotions", asyncHandler(async (_req, res) => {
    const snaps = await col("promotions").where("active", "==", true).get();
    const today = todayInBangkok();
    res.json(snaps.docs.map((d) => d.data())
      .filter((p) => !p.endDate || p.endDate >= today)
      .map(({ code, description, discountType, discountValue, daysOfWeek, startDate, endDate }) => ({
        code, description, discountType, discountValue, daysOfWeek, startDate, endDate,
      })));
  }));

  api.get("/showtimes/:showtimeId", asyncHandler(async (req, res) => {
    const snap = await col("showtimes").doc(req.params.showtimeId).get();
    if (!snap.exists) throw new HttpError(404, "ไม่พบรอบฉาย");
    const showtime = { id: snap.id, ...snap.data() };
    const [movieSnap, seatSnap, pricing] = await Promise.all([
      col("movies").doc(showtime.movieId).get(),
      col("seatMaps").doc(showtime.id).get(),
      store.getPricing(),
    ]);
    const { booked, holds } = readSeatState(seatSnap.exists ? seatSnap.data() : {});
    const myUid = req.user?.uid;
    const startsAt = showtimeStartsAt(showtime);
    res.json({
      ...showtime,
      bookable: (showtime.status || "active") === "active" && Boolean(startsAt) && startsAt.getTime() > Date.now(),
      movie: movieSnap.exists ? { id: movieSnap.id, ...movieSnap.data() } : { id: showtime.movieId },
      pricing: { seatPrices: pricing.seatPrices, serviceFeePerSeat: pricing.serviceFeePerSeat, holdMinutes: pricing.holdMinutes },
      seats: {
        booked: [...booked],
        held: Object.entries(holds).filter(([, h]) => h.uid !== myUid).map(([seat]) => seat),
      },
    });
  }));

  // v1 compatible seat endpoint (read-only)
  api.get("/seats/:showtimeId", asyncHandler(async (req, res) => {
    const seatSnap = await col("seatMaps").doc(req.params.showtimeId).get();
    const { booked, holds } = readSeatState(seatSnap.exists ? seatSnap.data() : {});
    const myUid = req.user?.uid;
    res.json({
      sold: [],
      booked: [...booked],
      held: Object.entries(holds).filter(([, h]) => h.uid !== myUid).map(([seat]) => seat),
    });
  }));

  // ---- current user ----
  async function upsertProfile(req, displayName) {
    const ref = col("users").doc(req.user.uid);
    const [snap, pricing] = await Promise.all([ref.get(), store.getPricing()]);
    const existing = snap.exists ? snap.data() : null;
    const now = new Date().toISOString();
    const profile = {
      uid: req.user.uid,
      email: req.user.email || existing?.email || "",
      displayName: cleanString(displayName, 60) || existing?.displayName || req.user.name || "ผู้ใช้",
      loyaltyPoints: Number.isFinite(Number(existing?.loyaltyPoints)) ? Number(existing.loyaltyPoints) : pricing.loyalty.signupBonus,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await ref.set(profile, { merge: true });
    req.role = null;
    const role = await loadRole(req);
    return { ...existing, ...profile, role };
  }

  api.get("/me", requireAuth, asyncHandler(async (req, res) => {
    const user = await store.getUser(req.user.uid);
    if (!user) return res.json(await upsertProfile(req));
    return res.json({ ...user, role: await loadRole(req) });
  }));

  api.post("/me", requireAuth, asyncHandler(async (req, res) => {
    res.status(201).json(await upsertProfile(req, req.body?.displayName));
  }));

  async function bookingsOfUser(uid) {
    const snaps = await col("bookings").where("uid", "==", uid).get();
    return snaps.docs.map((d) => presentBooking(d.data()))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  api.get("/me/bookings", requireAuth, asyncHandler(async (req, res) => {
    res.json(await bookingsOfUser(req.user.uid));
  }));

  // v1 compatible user routes, now protected
  api.post("/users", requireAuth, asyncHandler(async (req, res) => {
    if (req.body?.uid && req.body.uid !== req.user.uid) throw new HttpError(403, "คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้");
    res.status(201).json(await upsertProfile(req, req.body?.displayName));
  }));

  api.get("/users/:uid", asyncHandler(async (req, res) => {
    await assertSelfOrAdmin(req, req.params.uid);
    const user = await store.getUser(req.params.uid);
    if (!user) throw new HttpError(404, "User not found");
    res.json(user);
  }));

  api.get("/users/:uid/bookings", asyncHandler(async (req, res) => {
    await assertSelfOrAdmin(req, req.params.uid);
    res.json(await bookingsOfUser(req.params.uid));
  }));

  // ---- booking flow ----
  api.post("/bookings/hold", requireAuth, asyncHandler(async (req, res) => {
    const showtimeId = cleanString(req.body?.showtimeId, 200);
    if (!showtimeId) throw new HttpError(400, "กรุณาเลือกรอบฉาย");
    const seatCheck = validateSeats(req.body?.seats);
    if (!seatCheck.ok) throw new HttpError(400, seatCheck.message);
    const booking = await store.holdSeats({ uid: req.user.uid, email: req.user.email, showtimeId, seats: seatCheck.seats });
    res.status(201).json(booking);
  }));

  api.get("/bookings/:bookingId", requireAuth, asyncHandler(async (req, res) => {
    const booking = await store.getBooking(req.params.bookingId);
    if (!booking) throw new HttpError(404, "ไม่พบข้อมูลการจอง");
    if (booking.uid !== req.user.uid) await assertSelfOrAdmin(req, booking.uid);
    res.json(presentBooking(booking));
  }));

  api.post("/bookings/:bookingId/preview", requireAuth, asyncHandler(async (req, res) => {
    res.json(await store.previewBooking({
      bookingId: req.params.bookingId,
      uid: req.user.uid,
      promoCode: req.body?.promoCode,
      usePoints: Boolean(req.body?.usePoints),
    }));
  }));

  api.post("/bookings/:bookingId/pay", requireAuth, asyncHandler(async (req, res) => {
    const booking = await store.payBooking({
      bookingId: req.params.bookingId,
      uid: req.user.uid,
      email: req.user.email,
      promoCode: req.body?.promoCode,
      usePoints: Boolean(req.body?.usePoints),
      paymentMethod: req.body?.paymentMethod,
      cardLast4: req.body?.cardLast4,
      siteOrigin: req.get("origin") || "",
    });
    res.json(booking);
  }));

  // Stripe Checkout (test mode): returns the hosted payment page URL.
  api.post("/bookings/:bookingId/stripe-checkout", requireAuth, asyncHandler(async (req, res) => {
    res.json(await store.startStripeCheckout({
      bookingId: req.params.bookingId,
      uid: req.user.uid,
      email: req.user.email,
      promoCode: req.body?.promoCode,
      usePoints: Boolean(req.body?.usePoints),
      origin: req.get("origin") || "",
      holdMinutes: STRIPE_HOLD_MINUTES,
    }));
  }));

  // Called when the customer comes back from Stripe; the server asks Stripe whether it was paid.
  api.post("/bookings/:bookingId/stripe-confirm", requireAuth, asyncHandler(async (req, res) => {
    const booking = await store.getBooking(req.params.bookingId);
    if (!booking) throw new HttpError(404, "ไม่พบข้อมูลการจอง");
    if (booking.uid !== req.user.uid) await assertSelfOrAdmin(req, booking.uid);
    res.json(await store.confirmStripePayment({ bookingId: req.params.bookingId, siteOrigin: req.get("origin") || "" }));
  }));

  api.post("/bookings/:bookingId/cancel", requireAuth, asyncHandler(async (req, res) => {
    res.json(await store.cancelPending({ bookingId: req.params.bookingId, uid: req.user.uid }));
  }));

  // v1 clients created bookings in one step; that flow skipped seat holds and is no longer supported.
  api.post("/bookings", (_req, _res, next) => next(new HttpError(410, "กรุณารีเฟรชหน้าเว็บแล้วเลือกที่นั่งใหม่")));
  api.post("/checkout/preview", (_req, _res, next) => next(new HttpError(410, "กรุณารีเฟรชหน้าเว็บแล้วเลือกที่นั่งใหม่")));

  // =========================================================================
  // Admin
  // =========================================================================
  const admin = express.Router();
  admin.use(requireAdmin);

  // ---- dashboard ----
  admin.get("/summary", asyncHandler(async (_req, res) => {
    const today = todayInBangkok();
    const from = addDays(today, -6);
    const [week, showtimesToday, pendingSnaps] = await Promise.all([
      bookingsPaidBetween(from, today),
      showtimesBetween(today, today),
      col("bookings").where("status", "==", BOOKING_STATUS.PENDING).get(),
    ]);
    const series = dateRange(from, today).map((date) => ({ date, revenue: 0, tickets: 0, bookings: 0 }));
    const seriesByDate = Object.fromEntries(series.map((row) => [row.date, row]));
    const topMovies = {};
    for (const b of week) {
      const row = seriesByDate[todayInBangkok(new Date(b.paidAt))];
      if (row) {
        row.revenue += Number(b.pricing?.total || 0);
        row.tickets += b.seats.length;
        row.bookings += 1;
      }
      const key = b.movieId || b.movie?.id;
      topMovies[key] = topMovies[key] || { movieId: key, title: b.movie?.title || key, tickets: 0, revenue: 0 };
      topMovies[key].tickets += b.seats.length;
      topMovies[key].revenue += Number(b.pricing?.total || 0);
    }
    const todayRow = seriesByDate[today];
    const activeToday = showtimesToday.filter((st) => (st.status || "active") === "active");
    const pending = pendingSnaps.docs.map((d) => presentBooking(d.data())).filter((b) => b.status === BOOKING_STATUS.PENDING);
    res.json({
      today,
      todayRevenue: todayRow.revenue,
      todayTickets: todayRow.tickets,
      todayBookings: todayRow.bookings,
      showtimesToday: activeToday.length,
      pendingHolds: pending.length,
      weekRevenue: series.reduce((sum, row) => sum + row.revenue, 0),
      series,
      topMovies: Object.values(topMovies).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    });
  }));

  // ---- movies ----
  function parseCast(value) {
    let list = value;
    if (typeof value === "string") {
      list = value.split("\n").map((line) => {
        const [name, role, image] = line.split("|").map((part) => part.trim());
        return { name, role, image };
      });
    }
    if (!Array.isArray(list)) return [];
    return list
      .map((actor) => ({ name: cleanString(actor?.name, 80), role: cleanString(actor?.role, 80), image: cleanString(actor?.image, 500) }))
      .filter((actor) => actor.name && isHttpsUrl(actor.image))
      .slice(0, 20);
  }

  function parseMovieInput(body = {}) {
    const titleThai = cleanString(body.titleThai, 150);
    if (!titleThai) throw new HttpError(400, "กรุณากรอกชื่อภาพยนตร์ (ภาษาไทย)");
    const durationMinutes = Math.round(Number(body.durationMinutes));
    if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 400) {
      throw new HttpError(400, "ความยาวภาพยนตร์ต้องอยู่ระหว่าง 30-400 นาที");
    }
    const status = MOVIE_STATUSES.includes(body.status) ? body.status : "now_showing";
    const images = {};
    for (const key of ["posterImage", "backdropImage", "trailerImage"]) {
      const value = cleanString(body[key], 1000);
      if (!isHttpsUrl(value)) throw new HttpError(400, `ลิงก์รูป ${key} ต้องขึ้นต้นด้วย https://`);
      images[key] = value;
    }
    return {
      titleThai,
      titleEng: cleanString(body.titleEng, 150),
      genres: toStringList(body.genres, 10),
      durationMinutes,
      duration: formatDuration(durationMinutes),
      rating: cleanString(body.rating, 10),
      reviews: cleanString(body.reviews, 20),
      releaseDate: cleanString(body.releaseDate, 40),
      ageLimit: cleanString(body.ageLimit, 10),
      description: cleanString(body.description, 3000),
      ...images,
      cast: parseCast(body.cast),
      status,
    };
  }

  admin.get("/movies", asyncHandler(async (_req, res) => {
    const movies = await getMoviesMap();
    res.json(Object.values(movies).sort((a, b) => movieTitle(a).localeCompare(movieTitle(b), "th")));
  }));

  admin.post("/movies", asyncHandler(async (req, res) => {
    const movie = parseMovieInput(req.body);
    const id = slugify(req.body?.id || movie.titleEng || movie.titleThai) || `movie-${Date.now()}`;
    const ref = col("movies").doc(id);
    if ((await ref.get()).exists) throw new HttpError(409, `มีภาพยนตร์รหัส ${id} อยู่แล้ว`);
    const now = new Date().toISOString();
    const doc = { id, ...movie, createdAt: now, updatedAt: now };
    await ref.set(doc);
    res.status(201).json(doc);
  }));

  admin.put("/movies/:movieId", asyncHandler(async (req, res) => {
    const ref = col("movies").doc(req.params.movieId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "ไม่พบภาพยนตร์");
    const movie = parseMovieInput(req.body);
    await ref.set({ ...movie, showtimes: null, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ ...snap.data(), ...movie, id: ref.id });
  }));

  admin.delete("/movies/:movieId", asyncHandler(async (req, res) => {
    const id = req.params.movieId;
    const ref = col("movies").doc(id);
    if (!(await ref.get()).exists) throw new HttpError(404, "ไม่พบภาพยนตร์");
    const hasBookings = !(await col("bookings").where("movieId", "==", id).limit(1).get()).empty;
    if (hasBookings) {
      await ref.set({ status: "archived", updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true, archived: true, message: "ภาพยนตร์นี้มีประวัติการจอง จึงเปลี่ยนเป็นสถานะเก็บถาวรแทนการลบ" });
    }
    const showtimes = await col("showtimes").where("movieId", "==", id).get();
    const batch = firestore.batch();
    showtimes.docs.forEach((doc) => {
      batch.delete(doc.ref);
      batch.delete(col("seatMaps").doc(doc.id));
    });
    batch.delete(ref);
    await batch.commit();
    return res.json({ ok: true, deleted: true, deletedShowtimes: showtimes.size });
  }));

  // ---- cinemas (used by the showtime form) ----
  admin.get("/cinemas", asyncHandler(async (_req, res) => {
    const snaps = await col("cinemas").get();
    res.json(snaps.docs.map((d) => d.data()).sort((a, b) => a.name.localeCompare(b.name)));
  }));

  async function rememberCinemaHall(cinema, hall) {
    const ref = col("cinemas").doc(slugify(cinema) || "cinema");
    const snap = await ref.get();
    const halls = new Set(snap.exists ? snap.data().halls || [] : []);
    if (snap.exists && halls.has(hall)) return;
    halls.add(hall);
    await ref.set({
      id: ref.id,
      name: cinema,
      halls: [...halls].sort(),
      ...(snap.exists ? {} : { distance: "", amenities: [], createdAt: new Date().toISOString() }),
    }, { merge: true });
  }

  // ---- showtimes ----
  admin.get("/showtimes", asyncHandler(async (req, res) => {
    const today = todayInBangkok();
    const from = isValidDate(req.query.from) ? req.query.from : today;
    const to = isValidDate(req.query.to) ? req.query.to : addDays(from, 6);
    const [showtimes, movies] = await Promise.all([showtimesBetween(from, to), getMoviesMap()]);
    const seatSnaps = showtimes.length ? await firestore.getAll(...showtimes.map((st) => col("seatMaps").doc(st.id))) : [];
    const rows = showtimes
      .filter((st) => !req.query.movieId || st.movieId === req.query.movieId)
      .map((st) => {
        const seatSnap = seatSnaps.find((s) => s.id === st.id);
        const { booked, holds } = readSeatState(seatSnap?.exists ? seatSnap.data() : {});
        return {
          ...st,
          status: st.status || "active",
          movieTitle: movieTitle(movies[st.movieId]) || st.movieId,
          bookedSeats: booked.size,
          heldSeats: Object.keys(holds).length,
          capacity: HALL_CAPACITY,
        };
      })
      .sort((a, b) => (a.date + a.startTime + a.cinema + a.hall).localeCompare(b.date + b.startTime + b.cinema + b.hall));
    res.json(rows);
  }));

  function parseTimes(value) {
    const list = toStringList(value, 20);
    const invalid = list.filter((t) => !isValidTime(t));
    if (invalid.length) throw new HttpError(400, `รูปแบบเวลาไม่ถูกต้อง: ${invalid.join(", ")} (ใช้ HH:MM)`);
    return [...new Set(list)].sort();
  }

  admin.post("/showtimes", asyncHandler(async (req, res) => {
    const body = req.body || {};
    const movieSnap = await col("movies").doc(cleanString(body.movieId, 100)).get();
    if (!movieSnap.exists) throw new HttpError(400, "กรุณาเลือกภาพยนตร์");
    const movie = movieSnap.data();
    if (movie.status === "archived") throw new HttpError(400, "ภาพยนตร์นี้ถูกเก็บถาวรแล้ว");
    const cinema = cleanString(body.cinema, 100);
    const hall = cleanString(body.hall, 60);
    if (!cinema || !hall) throw new HttpError(400, "กรุณากรอกโรงภาพยนตร์และโรงย่อย");
    const today = todayInBangkok();
    const dateFrom = body.dateFrom;
    const dateTo = body.dateTo || body.dateFrom;
    if (!isValidDate(dateFrom) || !isValidDate(dateTo) || dateTo < dateFrom) throw new HttpError(400, "ช่วงวันที่ไม่ถูกต้อง");
    if (dateFrom < today) throw new HttpError(400, "สร้างรอบฉายย้อนหลังไม่ได้");
    const dates = dateRange(dateFrom, dateTo, 31);
    const times = parseTimes(body.times);
    if (!times.length) throw new HttpError(400, "กรุณากรอกเวลาฉายอย่างน้อย 1 รอบ");

    const durationMinutes = Number(movie.durationMinutes) || 120;
    const nowMs = Date.now();
    const created = [];
    const skipped = [];
    const batch = firestore.batch();
    const createdAt = new Date().toISOString();
    for (const date of dates) {
      const existing = await activeShowtimesInHall(date, cinema, hall);
      for (const startTime of times) {
        if (new Date(`${date}T${startTime}:00+07:00`).getTime() <= nowMs) {
          skipped.push({ date, startTime, reason: "เวลานี้ผ่านไปแล้ว" });
          continue;
        }
        const clash = hasOverlap({ startTime, durationMinutes }, existing);
        if (clash) {
          skipped.push({ date, startTime, reason: `ชนกับรอบ ${clash.startTime}-${clash.endTime} (${clash.movieId})` });
          continue;
        }
        const id = showtimeIdFor(movieSnap.id, date, startTime, hall);
        const doc = {
          id,
          movieId: movieSnap.id,
          cinema,
          hall,
          format: cleanString(body.format, 40) || "Digital 2D",
          type: cleanString(body.type, 80),
          date,
          startTime,
          endTime: minutesToTime(timeToMinutes(startTime) + durationMinutes),
          status: "active",
          createdAt,
        };
        batch.set(col("showtimes").doc(id), doc);
        batch.set(col("seatMaps").doc(id), { booked: [], holds: {} });
        existing.push(doc);
        created.push(doc);
      }
    }
    if (created.length > 450) throw new HttpError(400, "สร้างได้สูงสุดครั้งละ 450 รอบ");
    if (created.length) {
      await batch.commit();
      await rememberCinemaHall(cinema, hall);
    }
    res.status(created.length ? 201 : 200).json({ created, skipped });
  }));

  admin.get("/showtimes/:showtimeId/seats", asyncHandler(async (req, res) => {
    const id = req.params.showtimeId;
    const stSnap = await col("showtimes").doc(id).get();
    if (!stSnap.exists) throw new HttpError(404, "ไม่พบรอบฉาย");
    const [seatSnap, bookings, movieSnap] = await Promise.all([
      col("seatMaps").doc(id).get(),
      bookingsForShowtime(id),
      col("movies").doc(stSnap.data().movieId).get(),
    ]);
    const { booked, holds } = readSeatState(seatSnap.exists ? seatSnap.data() : {});
    const bySeat = {};
    bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)).forEach((b) => {
      b.seats.forEach((seat) => { bySeat[seat] = b; });
    });
    const seats = Object.keys(SEAT_TYPE_BY_CODE).map((code) => {
      const booking = bySeat[code];
      let state = "free";
      if (booked.has(code)) state = booking?.status === BOOKING_STATUS.USED ? "used" : "booked";
      else if (holds[code]) state = "held";
      return {
        code,
        type: SEAT_TYPE_BY_CODE[code],
        state,
        bookingId: booking?.bookingId || holds[code]?.bookingId || null,
        userEmail: booking?.userEmail || null,
      };
    });
    res.json({
      showtime: { id, ...stSnap.data() },
      movieTitle: movieTitle(movieSnap.exists ? movieSnap.data() : null),
      rows: SEAT_ROWS,
      seats,
      bookings: bookings.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    });
  }));

  async function activeBookingCount(showtimeId) {
    const bookings = await bookingsForShowtime(showtimeId);
    return bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)).length;
  }

  admin.put("/showtimes/:showtimeId", asyncHandler(async (req, res) => {
    const ref = col("showtimes").doc(req.params.showtimeId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "ไม่พบรอบฉาย");
    const current = snap.data();
    const body = req.body || {};
    const next = {
      date: body.date ?? current.date,
      startTime: body.startTime ?? current.startTime,
      cinema: cleanString(body.cinema ?? current.cinema, 100),
      hall: cleanString(body.hall ?? current.hall, 60),
      format: cleanString(body.format ?? current.format, 40),
      type: cleanString(body.type ?? current.type, 80),
      status: ["active", "cancelled"].includes(body.status) ? body.status : (current.status || "active"),
    };
    if (!isValidDate(next.date) || !isValidTime(next.startTime)) throw new HttpError(400, "วันหรือเวลาไม่ถูกต้อง");
    const moved = ["date", "startTime", "cinema", "hall"].some((key) => next[key] !== current[key]);
    const cancelling = next.status === "cancelled" && current.status !== "cancelled";
    if ((moved || cancelling) && (await activeBookingCount(ref.id)) > 0) {
      throw new HttpError(409, "รอบนี้มีการจองแล้ว ต้องยกเลิกการจองทั้งหมดก่อนจึงจะย้ายหรือยกเลิกรอบได้");
    }
    const movieSnap = await col("movies").doc(current.movieId).get();
    const durationMinutes = Number(movieSnap.data()?.durationMinutes) || 120;
    if (moved && next.status === "active") {
      const others = await activeShowtimesInHall(next.date, next.cinema, next.hall, ref.id);
      const clash = hasOverlap({ startTime: next.startTime, durationMinutes }, others);
      if (clash) throw new HttpError(409, `ชนกับรอบ ${clash.startTime}-${clash.endTime} ในโรงเดียวกัน`);
    }
    next.endTime = minutesToTime(timeToMinutes(next.startTime) + durationMinutes);
    next.updatedAt = new Date().toISOString();
    await ref.set(next, { merge: true });
    if (moved) await rememberCinemaHall(next.cinema, next.hall);
    res.json({ id: ref.id, ...current, ...next });
  }));

  admin.delete("/showtimes/:showtimeId", asyncHandler(async (req, res) => {
    const ref = col("showtimes").doc(req.params.showtimeId);
    if (!(await ref.get()).exists) throw new HttpError(404, "ไม่พบรอบฉาย");
    if ((await activeBookingCount(ref.id)) > 0) throw new HttpError(409, "รอบนี้มีการจองแล้ว ลบไม่ได้ (ยกเลิกการจองก่อน หรือเปลี่ยนเป็นปิดรอบ)");
    const batch = firestore.batch();
    batch.delete(ref);
    batch.delete(col("seatMaps").doc(ref.id));
    await batch.commit();
    res.json({ ok: true });
  }));

  // ---- pricing ----
  admin.get("/settings/pricing", asyncHandler(async (_req, res) => res.json(await store.getPricing())));

  admin.put("/settings/pricing", asyncHandler(async (req, res) => {
    const pricing = normalizePricing(req.body || {});
    await col("settings").doc("pricing").set({ ...pricing, updatedAt: new Date().toISOString(), updatedBy: req.user.uid });
    res.json(pricing);
  }));

  // ---- promotions ----
  function parsePromoInput(body = {}, code) {
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new HttpError(400, "โค้ดต้องเป็น A-Z หรือ 0-9 ยาว 3-20 ตัว");
    const discountType = body.discountType === "percent" ? "percent" : "amount";
    const discountValue = Math.round(Number(body.discountValue));
    if (!Number.isFinite(discountValue) || discountValue <= 0) throw new HttpError(400, "มูลค่าส่วนลดต้องมากกว่า 0");
    if (discountType === "percent" && discountValue > 100) throw new HttpError(400, "ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100");
    const startDate = body.startDate || null;
    const endDate = body.endDate || null;
    if ((startDate && !isValidDate(startDate)) || (endDate && !isValidDate(endDate))) throw new HttpError(400, "วันที่ไม่ถูกต้อง");
    if (startDate && endDate && endDate < startDate) throw new HttpError(400, "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
    const daysOfWeek = (Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [])
      .map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return {
      code,
      description: cleanString(body.description, 200),
      discountType,
      discountValue,
      daysOfWeek: [...new Set(daysOfWeek)].sort(),
      startDate,
      endDate,
      totalLimit: Math.max(0, Math.round(Number(body.totalLimit) || 0)),
      active: body.active !== false,
    };
  }

  admin.get("/promotions", asyncHandler(async (_req, res) => {
    const snaps = await col("promotions").get();
    res.json(snaps.docs.map((d) => d.data()).sort((a, b) => a.code.localeCompare(b.code)));
  }));

  admin.post("/promotions", asyncHandler(async (req, res) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const promo = parsePromoInput(req.body, code);
    const ref = col("promotions").doc(code);
    if ((await ref.get()).exists) throw new HttpError(409, `มีโค้ด ${code} อยู่แล้ว`);
    const doc = { ...promo, usedCount: 0, createdAt: new Date().toISOString() };
    await ref.set(doc);
    res.status(201).json(doc);
  }));

  admin.put("/promotions/:code", asyncHandler(async (req, res) => {
    const ref = col("promotions").doc(req.params.code);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "ไม่พบโค้ด");
    const promo = parsePromoInput(req.body, req.params.code);
    await ref.set({ ...promo, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ ...snap.data(), ...promo });
  }));

  admin.delete("/promotions/:code", asyncHandler(async (req, res) => {
    const ref = col("promotions").doc(req.params.code);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "ไม่พบโค้ด");
    if (Number(snap.data().usedCount || 0) > 0) {
      await ref.set({ active: false }, { merge: true });
      return res.json({ ok: true, deactivated: true, message: "โค้ดนี้เคยถูกใช้แล้ว จึงปิดการใช้งานแทนการลบ" });
    }
    await ref.delete();
    return res.json({ ok: true, deleted: true });
  }));

  // ---- bookings ----
  admin.get("/bookings", asyncHandler(async (req, res) => {
    const q = cleanString(req.query.q, 120);
    let docs;
    if (/^BK-/i.test(q)) {
      const booking = await store.getBooking(q.toUpperCase());
      docs = booking ? [booking] : [];
    } else if (q.includes("@")) {
      docs = (await col("bookings").where("userEmail", "==", q.toLowerCase()).get()).docs.map((d) => d.data());
    } else if (req.query.showtimeId) {
      docs = (await col("bookings").where("showtimeId", "==", String(req.query.showtimeId)).get()).docs.map((d) => d.data());
    } else if (isValidDate(req.query.date)) {
      docs = (await col("bookings").where("showtimeDate", "==", req.query.date).get()).docs.map((d) => d.data());
    } else {
      docs = (await col("bookings").orderBy("createdAt", "desc").limit(150).get()).docs.map((d) => d.data());
    }
    const status = req.query.status;
    const rows = docs
      .map((b) => presentBooking(b))
      .filter((b) => !status || b.status === status)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 300);
    res.json(rows);
  }));

  admin.get("/bookings/:bookingId", asyncHandler(async (req, res) => {
    const booking = await store.getBooking(req.params.bookingId);
    if (!booking) throw new HttpError(404, "ไม่พบข้อมูลการจอง");
    res.json(presentBooking(booking));
  }));

  admin.post("/bookings/:bookingId/cancel", asyncHandler(async (req, res) => {
    const booking = await store.adminCancel({
      bookingId: req.params.bookingId,
      adminUid: req.user.uid,
      reason: cleanString(req.body?.reason, 200),
    });
    res.json(presentBooking(booking));
  }));

  admin.post("/check-in", asyncHandler(async (req, res) => {
    const booking = await store.checkIn({ code: req.body?.code, adminUid: req.user.uid, force: Boolean(req.body?.force) });
    res.json(presentBooking(booking));
  }));

  // ---- reports ----
  function reportRange(query, defaultDays = 30) {
    const today = todayInBangkok();
    const to = isValidDate(query.to) ? query.to : today;
    const from = isValidDate(query.from) ? query.from : addDays(to, -(defaultDays - 1));
    if (from > to) throw new HttpError(400, "วันเริ่มต้องไม่หลังวันสิ้นสุด");
    if (dateRange(from, to, 400).length >= 400) throw new HttpError(400, "ช่วงวันที่ยาวเกินไป (สูงสุด 1 ปี)");
    return { from, to };
  }

  admin.get("/reports/sales", asyncHandler(async (req, res) => {
    const { from, to } = reportRange(req.query);
    const groupBy = req.query.groupBy === "month" ? "month" : "day";
    const bookings = await bookingsPaidBetween(from, to);
    const rows = new Map();
    if (groupBy === "day") dateRange(from, to, 400).forEach((d) => rows.set(d, null));
    for (const b of bookings) {
      const date = todayInBangkok(new Date(b.paidAt));
      const key = groupBy === "month" ? date.slice(0, 7) : date;
      const row = rows.get(key) || { period: key, bookings: 0, tickets: 0, gross: 0, discount: 0, revenue: 0 };
      row.bookings += 1;
      row.tickets += b.seats.length;
      row.gross += Number(b.pricing?.seatSubtotal || 0) + Number(b.pricing?.serviceFee || 0);
      row.discount += Number(b.pricing?.discount || 0);
      row.revenue += Number(b.pricing?.total || 0);
      rows.set(key, row);
    }
    const list = [...rows.entries()]
      .map(([period, row]) => row || { period, bookings: 0, tickets: 0, gross: 0, discount: 0, revenue: 0 })
      .sort((a, b) => a.period.localeCompare(b.period));
    const totals = list.reduce((t, r) => ({
      bookings: t.bookings + r.bookings,
      tickets: t.tickets + r.tickets,
      gross: t.gross + r.gross,
      discount: t.discount + r.discount,
      revenue: t.revenue + r.revenue,
    }), { bookings: 0, tickets: 0, gross: 0, discount: 0, revenue: 0 });
    res.json({ from, to, groupBy, rows: list, totals });
  }));

  admin.get("/reports/movies", asyncHandler(async (req, res) => {
    const { from, to } = reportRange(req.query);
    const bookings = await bookingsPaidBetween(from, to);
    const rows = {};
    for (const b of bookings) {
      const key = b.movieId || b.movie?.id || "unknown";
      rows[key] = rows[key] || { movieId: key, title: b.movie?.title || key, bookings: 0, tickets: 0, checkedIn: 0, revenue: 0 };
      rows[key].bookings += 1;
      rows[key].tickets += b.seats.length;
      if (b.status === BOOKING_STATUS.USED) rows[key].checkedIn += b.seats.length;
      rows[key].revenue += Number(b.pricing?.total || 0);
    }
    const list = Object.values(rows).sort((a, b) => b.tickets - a.tickets);
    res.json({ from, to, rows: list });
  }));

  admin.get("/reports/showtimes", asyncHandler(async (req, res) => {
    const date = isValidDate(req.query.date) ? req.query.date : todayInBangkok();
    const [showtimes, movies, bookingSnaps] = await Promise.all([
      showtimesBetween(date, date),
      getMoviesMap(),
      col("bookings").where("showtimeDate", "==", date).get(),
    ]);
    const seatSnaps = showtimes.length ? await firestore.getAll(...showtimes.map((st) => col("seatMaps").doc(st.id))) : [];
    const bookings = bookingSnaps.docs.map((d) => presentBooking(d.data()));
    const rows = showtimes.map((st) => {
      const seatSnap = seatSnaps.find((s) => s.id === st.id);
      const { booked, holds } = readSeatState(seatSnap?.exists ? seatSnap.data() : {});
      const mine = bookings.filter((b) => b.showtimeId === st.id && REVENUE_STATUSES.includes(b.status));
      return {
        showtimeId: st.id,
        movieTitle: movieTitle(movies[st.movieId]) || st.movieId,
        cinema: st.cinema,
        hall: st.hall,
        startTime: st.startTime,
        endTime: st.endTime,
        status: st.status || "active",
        capacity: HALL_CAPACITY,
        booked: booked.size,
        held: Object.keys(holds).length,
        available: HALL_CAPACITY - booked.size - Object.keys(holds).length,
        occupancyPct: Math.round((booked.size / HALL_CAPACITY) * 100),
        checkedIn: mine.filter((b) => b.status === BOOKING_STATUS.USED).reduce((sum, b) => sum + b.seats.length, 0),
        revenue: mine.reduce((sum, b) => sum + Number(b.pricing?.total || 0), 0),
        seats: [...booked].sort(),
      };
    }).sort((a, b) => (a.startTime + a.cinema + a.hall).localeCompare(b.startTime + b.cinema + b.hall));
    res.json({ date, rows });
  }));

  // ---- users ----
  const listUsers = asyncHandler(async (_req, res) => {
    const snaps = await col("users").limit(1000).get();
    res.json(snaps.docs.map((d) => {
      const { uid, email, displayName, loyaltyPoints, role, createdAt } = d.data();
      return { uid: uid || d.id, email, displayName, loyaltyPoints, role: role || "customer", createdAt };
    }).sort((a, b) => String(a.email).localeCompare(String(b.email))));
  });
  admin.get("/users", listUsers);

  admin.put("/users/:uid/role", asyncHandler(async (req, res) => {
    const role = req.body?.role === "admin" ? "admin" : "customer";
    if (req.params.uid === req.user.uid && role !== "admin") throw new HttpError(400, "ไม่สามารถลดสิทธิ์ของตัวเองได้");
    const ref = col("users").doc(req.params.uid);
    if (!(await ref.get()).exists) throw new HttpError(404, "ไม่พบผู้ใช้");
    await ref.set({ role, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ uid: req.params.uid, role });
  }));

  // v1 listed every user publicly; now admin only.
  api.get("/users", requireAdmin, listUsers);

  api.use("/admin", admin);
  app.use("/api", api);

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message, ...error.extra });
    }
    if (error?.type === "entity.parse.failed") return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    if (String(error?.type || "").startsWith("Stripe")) {
      logger.error("Stripe error:", error.message, error.requestId || "");
      return res.status(502).json({ message: "ระบบชำระเงิน Stripe ขัดข้อง กรุณาลองใหม่อีกครั้ง" });
    }
    logger.error("Unhandled API error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่" });
  });

  app.locals.store = store;
  app.locals.effectiveStatus = effectiveStatus;
  return app;
}

module.exports = { createApp };
