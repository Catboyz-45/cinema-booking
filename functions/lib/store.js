const { FieldValue } = require("firebase-admin/firestore");
const {
  HttpError,
  randomCode,
  showtimeStartsAt,
  thaiDateLabel,
  todayInBangkok,
  escapeHtml,
} = require("./util");
const {
  BOOKING_STATUS,
  LEGACY_BLOCKED_SEATS,
  SEAT_TYPE_BY_CODE,
  PAYMENT_METHODS,
  normalizePricing,
  promoProblem,
  calculatePricing,
} = require("./domain");

function normalizePromoCode(raw) {
  return String(raw || "").trim().toUpperCase().slice(0, 30);
}

/** Seat map document → booked seats + holds that are still active. */
function readSeatState(data = {}, nowMs = Date.now()) {
  const legacySold = (Array.isArray(data.sold) ? data.sold : []).filter((seat) => !LEGACY_BLOCKED_SEATS.has(seat));
  const booked = new Set([...(Array.isArray(data.booked) ? data.booked : []), ...legacySold]);
  const holds = {};
  for (const [seat, hold] of Object.entries(data.holds || {})) {
    if (hold && Number(hold.expiresAt) > nowMs && !booked.has(seat)) holds[seat] = hold;
  }
  return { booked, holds };
}

function effectiveStatus(booking, nowMs = Date.now()) {
  const status = booking?.status || BOOKING_STATUS.PAID; // bookings from v1 were paid immediately
  if (status === BOOKING_STATUS.PENDING && booking.holdExpiresAt && Date.parse(booking.holdExpiresAt) <= nowMs) {
    return BOOKING_STATUS.EXPIRED;
  }
  return status;
}

function presentBooking(booking, nowMs = Date.now()) {
  if (!booking) return booking;
  return { ...booking, status: effectiveStatus(booking, nowMs) };
}

function movieTitle(movie) {
  return movie?.titleThai || movie?.title || movie?.titleEng || movie?.id || "";
}

function movieSnapshot(movie, showtime) {
  return {
    id: movie.id || showtime.movieId,
    title: movieTitle(movie),
    titleEng: movie.titleEng || "",
    poster: movie.posterImage || movie.backdropImage || movie.poster || "",
    format: showtime.format || "",
    language: showtime.type || "",
    cinema: showtime.cinema || "",
    hall: showtime.hall || "",
    durationMinutes: movie.durationMinutes || null,
  };
}

function showtimeSnapshot(showtime) {
  return {
    id: showtime.id,
    movieId: showtime.movieId,
    date: showtime.date,
    dateLabel: thaiDateLabel(showtime.date),
    startTime: showtime.startTime,
    endTime: showtime.endTime || "",
    cinema: showtime.cinema || "",
    hall: showtime.hall || "",
    format: showtime.format || "",
    type: showtime.type || "",
  };
}

function ticketEmailHtml(booking, siteOrigin) {
  const link = siteOrigin
    ? `${siteOrigin}/booking-confirmation.html?bookingId=${encodeURIComponent(booking.bookingId)}`
    : "";
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#e11d48">E-Ticket ของคุณพร้อมแล้ว</h2>
    <p><b>${escapeHtml(booking.movie.title)}</b></p>
    <p>${escapeHtml(booking.showtime.cinema)} • ${escapeHtml(booking.showtime.hall)}<br>
       ${escapeHtml(booking.showtime.dateLabel)} เวลา ${escapeHtml(booking.showtime.startTime)} น.</p>
    <p>ที่นั่ง: <b>${escapeHtml(booking.seats.join(", "))}</b></p>
    <p>Booking ID: <b>${escapeHtml(booking.bookingId)}</b></p>
    <p>ยอดชำระ: ${Number(booking.pricing.total).toLocaleString("th-TH")} บาท</p>
    ${link ? `<p><a href="${escapeHtml(link)}">เปิดตั๋วและ QR Code บนเว็บไซต์</a></p>` : ""}
    <p style="color:#64748b;font-size:12px">แสดง QR Code ในหน้าตั๋ว หรือแจ้ง Booking ID ที่หน้าโรงภาพยนตร์ก่อนเข้าชม</p>
  </div>`;
}

function createStore(firestore, { payments = null } = {}) {
  const col = (name) => firestore.collection(name);
  const nowIso = () => new Date().toISOString();

  async function getPricing() {
    const snap = await col("settings").doc("pricing").get();
    return normalizePricing(snap.exists ? snap.data() : {});
  }

  async function getUser(uid) {
    if (!uid) return null;
    const snap = await col("users").doc(uid).get();
    return snap.exists ? snap.data() : null;
  }

  async function getBooking(bookingId) {
    const snap = await col("bookings").doc(String(bookingId || "")).get();
    return snap.exists ? snap.data() : null;
  }

  async function getPromo(code) {
    if (!code) return null;
    const snap = await col("promotions").doc(code).get();
    return snap.exists ? snap.data() : null;
  }

  function assertOwner(booking, uid) {
    if (!booking) throw new HttpError(404, "ไม่พบข้อมูลการจอง");
    if (booking.uid !== uid) throw new HttpError(403, "คุณไม่มีสิทธิ์เข้าถึงการจองนี้");
  }

  // ---------------------------------------------------------------------------
  // Customer: hold seats → creates a pending booking that expires.
  // ---------------------------------------------------------------------------
  async function holdSeats({ uid, email, showtimeId, seats }) {
    const pricing = await getPricing();
    const nowMs = Date.now();
    const showtimeRef = col("showtimes").doc(showtimeId);
    const seatRef = col("seatMaps").doc(showtimeId);
    const bookingId = `BK-${randomCode(8)}`;
    const bookingRef = col("bookings").doc(bookingId);

    const replacedSessions = [];
    const booking = await firestore.runTransaction(async (tx) => {
      replacedSessions.length = 0;
      const [showtimeSnap, seatSnap] = await tx.getAll(showtimeRef, seatRef);
      if (!showtimeSnap.exists) throw new HttpError(404, "ไม่พบรอบฉาย");
      const showtime = { id: showtimeId, ...showtimeSnap.data() };
      if (showtime.status && showtime.status !== "active") throw new HttpError(409, "รอบฉายนี้ปิดการจองแล้ว");
      const startsAt = showtimeStartsAt(showtime);
      if (!startsAt || startsAt.getTime() <= nowMs) throw new HttpError(409, "รอบฉายนี้เริ่มฉายไปแล้ว");

      const movieSnap = await tx.get(col("movies").doc(showtime.movieId));
      const { booked, holds } = readSeatState(seatSnap.exists ? seatSnap.data() : {}, nowMs);
      const conflicts = seats.filter((seat) => booked.has(seat) || (holds[seat] && holds[seat].uid !== uid));
      if (conflicts.length) {
        throw new HttpError(409, `ที่นั่ง ${conflicts.join(", ")} ถูกจองไปแล้ว กรุณาเลือกใหม่`, { conflicts });
      }

      // A customer can only hold one set of seats per showtime: the previous hold is replaced.
      const ownOldBookingIds = new Set(Object.values(holds).filter((h) => h.uid === uid).map((h) => h.bookingId));
      const oldSnaps = ownOldBookingIds.size
        ? await tx.getAll(...[...ownOldBookingIds].map((id) => col("bookings").doc(id)))
        : [];

      const expiresAtMs = nowMs + pricing.holdMinutes * 60 * 1000;
      const nextHolds = {};
      for (const [seat, hold] of Object.entries(holds)) {
        if (!ownOldBookingIds.has(hold.bookingId)) nextHolds[seat] = hold;
      }
      for (const seat of seats) nextHolds[seat] = { bookingId, uid, expiresAt: expiresAtMs };
      tx.set(seatRef, { booked: [...booked], holds: nextHolds, updatedAt: new Date(nowMs).toISOString() });

      for (const snap of oldSnaps) {
        if (snap.exists && snap.data().status === BOOKING_STATUS.PENDING) {
          if (snap.data().payment?.sessionId) replacedSessions.push(snap.data().payment.sessionId);
          tx.update(snap.ref, {
            status: BOOKING_STATUS.CANCELLED,
            cancelledAt: new Date(nowMs).toISOString(),
            cancelReason: "ลูกค้าเลือกที่นั่งใหม่",
            holdExpiresAt: FieldValue.delete(),
          });
        }
      }

      const movie = movieSnap.exists ? movieSnap.data() : { id: showtime.movieId };
      const booking = {
        bookingId,
        uid,
        userEmail: email || null,
        status: BOOKING_STATUS.PENDING,
        showtimeId,
        showtimeDate: showtime.date,
        movieId: showtime.movieId,
        movie: movieSnapshot(movie, showtime),
        showtime: showtimeSnapshot(showtime),
        seats,
        pricing: calculatePricing({ seats, pricing }),
        payment: null,
        promotion: { code: null, discount: 0 },
        loyalty: { earnedPoints: 0, usedPoints: 0 },
        createdAt: new Date(nowMs).toISOString(),
        holdExpiresAt: new Date(expiresAtMs).toISOString(),
        qrPayload: `cinema:${bookingId}:${showtimeId}:${seats.join(",")}`,
      };
      tx.create(bookingRef, booking);
      return booking;
    });
    await Promise.all(replacedSessions.map((id) => payments?.expireSession(id)));
    return booking;
  }

  // ---------------------------------------------------------------------------
  // Customer: price preview for a pending booking (does not consume anything).
  // ---------------------------------------------------------------------------
  async function previewBooking({ bookingId, uid, promoCode, usePoints }) {
    const booking = await getBooking(bookingId);
    assertOwner(booking, uid);
    if (effectiveStatus(booking) !== BOOKING_STATUS.PENDING) {
      throw new HttpError(409, effectiveStatus(booking) === BOOKING_STATUS.EXPIRED
        ? "หมดเวลาชำระเงิน กรุณาเลือกที่นั่งใหม่"
        : "การจองนี้ไม่อยู่ในสถานะรอชำระเงิน");
    }
    const [pricing, user] = await Promise.all([getPricing(), getUser(uid)]);
    const code = normalizePromoCode(promoCode);
    let promo = null;
    if (code) {
      promo = await getPromo(code);
      const problem = promoProblem(promo, code, user);
      if (problem) throw new HttpError(400, problem);
    }
    const availablePoints = Number(user?.loyaltyPoints ?? 0);
    const calc = calculatePricing({ seats: booking.seats, pricing, promo, usePoints, availablePoints });
    return {
      booking: presentBooking(booking),
      movie: booking.movie,
      showtime: booking.showtime,
      seats: booking.seats,
      pricing: calc,
      promoCode: code,
      usePoints: calc.usedPoints > 0,
      holdExpiresAt: booking.holdExpiresAt,
      loyalty: {
        availablePoints,
        canUsePoints: availablePoints >= pricing.loyalty.pointsRequired,
        pointsRequired: pricing.loyalty.pointsRequired,
        pointsDiscount: pricing.loyalty.pointDiscount,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Customer: pay a pending booking (simulated payment gateway).
  // ---------------------------------------------------------------------------
  // `charged` = money already taken by Stripe: keep its price, never re-validate the promo.
  async function payBooking({ bookingId, uid, email, promoCode, usePoints, paymentMethod, cardLast4, siteOrigin, charged = null }) {
    const pricing = await getPricing();
    const code = normalizePromoCode(charged ? charged.promoCode : promoCode);
    const method = paymentMethod === "credit-card" ? "card" : paymentMethod;
    if (!charged && !PAYMENT_METHODS.includes(method)) throw new HttpError(400, "ช่องทางชำระเงินไม่ถูกต้อง");
    const bookingRef = col("bookings").doc(String(bookingId));
    const userRef = col("users").doc(uid);
    const promoRef = code ? col("promotions").doc(code) : null;

    return firestore.runTransaction(async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      const booking = bookingSnap.exists ? bookingSnap.data() : null;
      assertOwner(booking, uid);
      const nowMs = Date.now();
      const status = effectiveStatus(booking, nowMs);
      if (charged) {
        if (booking.status !== BOOKING_STATUS.PENDING) throw new HttpError(409, "การจองนี้ถูกยกเลิกหรือหมดเวลาไปแล้ว", { seatsLost: true });
      } else {
        if (status === BOOKING_STATUS.EXPIRED) throw new HttpError(409, "หมดเวลาชำระเงิน กรุณาเลือกที่นั่งใหม่");
        if (status !== BOOKING_STATUS.PENDING) throw new HttpError(409, "การจองนี้ชำระเงินหรือถูกยกเลิกไปแล้ว");
        if (payments?.enabled) throw new HttpError(400, "กรุณาชำระเงินผ่าน Stripe");
      }

      const seatRef = col("seatMaps").doc(booking.showtimeId);
      const reads = [seatRef, userRef];
      if (promoRef) reads.push(promoRef);
      const [seatSnap, userSnap, promoSnap] = await tx.getAll(...reads);

      const seatData = seatSnap.exists ? seatSnap.data() : {};
      const { booked, holds } = readSeatState(seatData, nowMs);
      // A paid Stripe booking keeps its seats as long as nobody else has taken them.
      const lost = booking.seats.filter((seat) => booked.has(seat)
        || (charged ? Boolean(holds[seat]) && holds[seat].bookingId !== bookingId : holds[seat]?.bookingId !== bookingId));
      if (lost.length) {
        throw new HttpError(409, `ที่นั่ง ${lost.join(", ")} ไม่ได้ถูกล็อกไว้แล้ว กรุณาเลือกใหม่`, { seatsLost: true });
      }

      const user = userSnap.exists ? userSnap.data() : { uid, loyaltyPoints: pricing.loyalty.signupBonus };
      let promo = null;
      if (promoRef) {
        promo = promoSnap.exists ? promoSnap.data() : null;
        const problem = charged ? null : promoProblem(promo, code, user);
        if (problem) throw new HttpError(400, problem);
      }

      const availablePoints = Number(user.loyaltyPoints ?? 0);
      const calc = charged
        ? charged.pricing
        : calculatePricing({ seats: booking.seats, pricing, promo, usePoints, availablePoints });
      const earnedPoints = pricing.loyalty.pointsEarnedPerBooking;
      const nextPoints = Math.max(0, availablePoints - calc.usedPoints + earnedPoints);
      const paidAt = new Date(nowMs).toISOString();

      // seats: hold → booked
      const nextHolds = {};
      for (const [seat, hold] of Object.entries(holds)) if (hold.bookingId !== bookingId) nextHolds[seat] = hold;
      tx.set(seatRef, { booked: [...booked, ...booking.seats], holds: nextHolds, updatedAt: paidAt });

      const update = {
        status: BOOKING_STATUS.PAID,
        paidAt,
        pricing: calc,
        userEmail: booking.userEmail || email || null,
        payment: charged ? charged.payment : {
          method,
          cardLast4: method === "card" ? String(cardLast4 || "").replace(/\D/g, "").slice(-4) || null : null,
          status: "paid",
          amount: calc.total,
          transactionId: `SIM-${randomCode(10)}`,
          gateway: "simulated",
        },
        pendingCharge: FieldValue.delete(),
        promotion: { code: code || null, discount: calc.promoDiscount },
        loyalty: { earnedPoints, usedPoints: calc.usedPoints, balanceAfterBooking: nextPoints },
        holdExpiresAt: FieldValue.delete(),
      };
      tx.update(bookingRef, update);

      const userUpdate = { uid, loyaltyPoints: nextPoints, updatedAt: paidAt };
      if (code) userUpdate.usedPromoCodes = FieldValue.arrayUnion(code);
      tx.set(userRef, userUpdate, { merge: true });
      if (promo) tx.update(promoRef, { usedCount: FieldValue.increment(1) });

      const result = { ...booking, ...update };
      delete result.holdExpiresAt;
      delete result.pendingCharge;
      const to = result.userEmail;
      if (to) {
        tx.create(col("mail").doc(), {
          to,
          bookingId,
          createdAt: paidAt,
          message: { subject: `E-Ticket ${bookingId} - ${booking.movie.title}`, html: ticketEmailHtml(result, siteOrigin) },
        });
      }
      return result;
    });
  }

  // ---------------------------------------------------------------------------
  // Stripe Checkout (test mode)
  // ---------------------------------------------------------------------------
  async function startStripeCheckout({ bookingId, uid, email, promoCode, usePoints, origin, holdMinutes }) {
    if (!payments?.enabled) throw new HttpError(400, "ยังไม่ได้ตั้งค่าระบบชำระเงิน Stripe");
    const preview = await previewBooking({ bookingId, uid, promoCode, usePoints });
    const booking = preview.booking;
    if (preview.pricing.total === 0) {
      // Fully covered by discounts: nothing to charge, issue the ticket directly.
      const paid = await payBooking({
        bookingId,
        uid,
        email,
        siteOrigin: origin,
        charged: {
          pricing: preview.pricing,
          promoCode: preview.promoCode || null,
          payment: { method: "free", status: "paid", amount: 0, transactionId: `FREE-${randomCode(10)}`, gateway: "none" },
        },
      });
      return { booking: paid };
    }
    await payments.expireSession(booking.payment?.sessionId); // one open session per booking
    const session = await payments.createCheckoutSession({ booking, pricing: preview.pricing, email, origin });

    const bookingRef = col("bookings").doc(bookingId);
    const seatRef = col("seatMaps").doc(booking.showtimeId);
    try {
      await firestore.runTransaction(async (tx) => {
        const [snap, seatSnap] = await tx.getAll(bookingRef, seatRef);
        const current = snap.data();
        if (effectiveStatus(current) !== BOOKING_STATUS.PENDING) throw new HttpError(409, "หมดเวลาชำระเงิน กรุณาเลือกที่นั่งใหม่");
        const nowMs = Date.now();
        const expiresAtMs = nowMs + holdMinutes * 60 * 1000;
        const holds = { ...(seatSnap.exists ? seatSnap.data().holds || {} : {}) };
        for (const seat of current.seats) {
          if (holds[seat]?.bookingId !== bookingId) throw new HttpError(409, "ที่นั่งไม่ได้ถูกล็อกไว้แล้ว กรุณาเลือกใหม่");
          holds[seat] = { ...holds[seat], expiresAt: expiresAtMs };
        }
        tx.update(seatRef, { holds, updatedAt: new Date(nowMs).toISOString() });
        tx.update(bookingRef, {
          holdExpiresAt: new Date(expiresAtMs).toISOString(),
          payment: { gateway: "stripe", status: "pending", sessionId: session.id, amount: preview.pricing.total },
          pendingCharge: { pricing: preview.pricing, promoCode: preview.promoCode || null },
        });
      });
    } catch (error) {
      await payments.expireSession(session.id);
      throw error;
    }
    return { url: session.url, sessionId: session.id };
  }

  /**
   * Checks the booking's Checkout Session with Stripe and, when it is paid, issues the ticket.
   * If the seats were lost in the meantime the payment is refunded automatically.
   * Returns the booking (paid, cancelled+refunded, or unchanged when not paid yet).
   */
  async function confirmStripePayment({ bookingId, siteOrigin }) {
    const booking = await getBooking(bookingId);
    if (!booking) throw new HttpError(404, "ไม่พบข้อมูลการจอง");
    if (booking.payment?.gateway !== "stripe" || !booking.payment?.sessionId || booking.status !== BOOKING_STATUS.PENDING) {
      return presentBooking(booking);
    }
    if (!payments?.enabled) return presentBooking(booking);
    const session = await payments.retrieveSession(booking.payment.sessionId);
    if (session.payment_status !== "paid") return presentBooking(booking);
    if (session.metadata?.bookingId !== bookingId) throw new HttpError(409, "ข้อมูลการชำระเงินไม่ตรงกับการจอง");

    const payment = payments.paymentFromSession(session);
    const pricing = booking.pendingCharge?.pricing;
    if (!pricing || Math.round(pricing.total * 100) !== session.amount_total) {
      throw new HttpError(409, "ยอดชำระไม่ตรงกับการจอง กรุณาติดต่อเจ้าหน้าที่");
    }
    try {
      return await payBooking({
        bookingId,
        uid: booking.uid,
        email: booking.userEmail,
        siteOrigin,
        charged: { pricing, promoCode: booking.pendingCharge.promoCode, payment },
      });
    } catch (error) {
      if (!error?.extra?.seatsLost) throw error;
      // Paid, but the seats are gone: refund and close the booking.
      const refund = await payments.refund(payment.transactionId);
      const at = nowIso();
      const update = {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: at,
        cancelReason: "ที่นั่งถูกจองไปก่อนชำระเงินสำเร็จ ระบบคืนเงินอัตโนมัติ",
        payment: { ...payment, status: "refunded", refundedAt: at, refundAmount: pricing.total, refundId: refund.id },
        pendingCharge: FieldValue.delete(),
        holdExpiresAt: FieldValue.delete(),
      };
      await col("bookings").doc(bookingId).update(update);
      return presentBooking({ ...booking, ...update, pendingCharge: undefined, holdExpiresAt: undefined });
    }
  }

  function releaseHoldsInTx(tx, seatRef, seatSnap, bookingId, nowIso) {
    if (!seatSnap.exists) return;
    const data = seatSnap.data();
    const nextHolds = {};
    for (const [seat, hold] of Object.entries(data.holds || {})) if (hold?.bookingId !== bookingId) nextHolds[seat] = hold;
    tx.update(seatRef, { holds: nextHolds, updatedAt: nowIso });
  }

  // Customer: give up a pending booking (e.g. "แก้ไขรายการ").
  async function cancelPending({ bookingId, uid }) {
    const bookingRef = col("bookings").doc(String(bookingId));
    return firestore.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      const booking = snap.exists ? snap.data() : null;
      assertOwner(booking, uid);
      if (booking.status !== BOOKING_STATUS.PENDING) throw new HttpError(409, "ยกเลิกได้เฉพาะการจองที่ยังไม่ชำระเงิน");
      const seatRef = col("seatMaps").doc(booking.showtimeId);
      const seatSnap = await tx.get(seatRef);
      const at = nowIso();
      releaseHoldsInTx(tx, seatRef, seatSnap, booking.bookingId, at);
      tx.update(bookingRef, {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: at,
        cancelledBy: uid,
        cancelReason: "ลูกค้ายกเลิกก่อนชำระเงิน",
        holdExpiresAt: FieldValue.delete(),
      });
      return { ok: true, sessionId: booking.payment?.sessionId || null };
    }).then(async (result) => {
      await payments?.expireSession(result.sessionId);
      return { ok: true };
    });
  }

  // Scheduler: mark an expired pending booking and release its seats.
  async function expirePending(bookingId) {
    const bookingRef = col("bookings").doc(String(bookingId));
    return firestore.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) return false;
      const booking = snap.data();
      if (effectiveStatus(booking) !== BOOKING_STATUS.EXPIRED || booking.status !== BOOKING_STATUS.PENDING) {
        if (booking.status !== BOOKING_STATUS.PENDING && booking.holdExpiresAt) {
          tx.update(bookingRef, { holdExpiresAt: FieldValue.delete() });
        }
        return false;
      }
      const seatRef = col("seatMaps").doc(booking.showtimeId);
      const seatSnap = await tx.get(seatRef);
      const at = nowIso();
      releaseHoldsInTx(tx, seatRef, seatSnap, booking.bookingId, at);
      tx.update(bookingRef, { status: BOOKING_STATUS.EXPIRED, expiredAt: at, holdExpiresAt: FieldValue.delete() });
      return true;
    });
  }

  async function expireOverdueHolds(limit = 200) {
    const snaps = await col("bookings").where("holdExpiresAt", "<=", nowIso()).limit(limit).get();
    let expired = 0;
    for (const doc of snaps.docs) {
      const data = doc.data();
      if (data.status === BOOKING_STATUS.PENDING && data.payment?.gateway === "stripe" && payments?.enabled) {
        try {
          const result = await confirmStripePayment({ bookingId: doc.id });
          if (result.status !== BOOKING_STATUS.PENDING) continue;
          await payments.expireSession(data.payment.sessionId);
        } catch (_error) {
          continue; // try again on the next run
        }
      }
      if (await expirePending(doc.id)) expired += 1;
    }
    return expired;
  }

  // ---------------------------------------------------------------------------
  // Admin: cancel / refund a booking.
  // ---------------------------------------------------------------------------
  async function adminCancel({ bookingId, adminUid, reason }) {
    const bookingRef = col("bookings").doc(String(bookingId));
    const before = await getBooking(bookingId);
    let stripeRefund = null;
    if (before && effectiveStatus(before) === BOOKING_STATUS.PAID && before.payment?.gateway === "stripe") {
      if (!payments?.enabled) throw new HttpError(400, "ยังไม่ได้ตั้งค่า Stripe จึงคืนเงินอัตโนมัติไม่ได้");
      stripeRefund = await payments.refund(before.payment.transactionId);
    } else if (before?.payment?.gateway === "stripe" && before.status === BOOKING_STATUS.PENDING) {
      await payments?.expireSession(before.payment.sessionId);
    }
    return firestore.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) throw new HttpError(404, "ไม่พบข้อมูลการจอง");
      const booking = snap.data();
      const status = effectiveStatus(booking);
      if (status === BOOKING_STATUS.USED) throw new HttpError(409, "ตั๋วนี้ถูกใช้เข้าชมแล้ว ยกเลิกไม่ได้");
      if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.PAID].includes(status)) {
        throw new HttpError(409, "การจองนี้ถูกยกเลิกหรือหมดอายุไปแล้ว");
      }
      const showtimeId = booking.showtimeId || booking.showtime?.id;
      const seatRef = col("seatMaps").doc(showtimeId);
      const code = booking.promotion?.code || null;
      const reads = [seatRef];
      const userRef = booking.uid ? col("users").doc(booking.uid) : null;
      if (userRef) reads.push(userRef);
      const promoRef = code ? col("promotions").doc(code) : null;
      if (promoRef) reads.push(promoRef);
      const [seatSnap, userSnap, promoSnap] = await tx.getAll(...reads);
      const at = nowIso();

      if (status === BOOKING_STATUS.PENDING) {
        releaseHoldsInTx(tx, seatRef, seatSnap, booking.bookingId, at);
      } else if (seatSnap.exists) {
        const data = seatSnap.data();
        const seats = new Set(booking.seats);
        tx.update(seatRef, {
          booked: (data.booked || []).filter((seat) => !seats.has(seat)),
          sold: (data.sold || []).filter((seat) => !seats.has(seat)),
          updatedAt: at,
        });
      }

      const update = {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: at,
        cancelledBy: adminUid,
        cancelReason: reason || "ยกเลิกโดยผู้ดูแลระบบ",
        holdExpiresAt: FieldValue.delete(),
      };
      if (status === BOOKING_STATUS.PAID) {
        update.payment = {
          ...(booking.payment || {}),
          status: "refunded",
          refundedAt: at,
          refundAmount: booking.pricing?.total || 0,
          ...(stripeRefund ? { refundId: stripeRefund.id } : {}),
        };
        if (userSnap?.exists) {
          const user = userSnap.data();
          const used = Number(booking.loyalty?.usedPoints || 0);
          const earned = Number(booking.loyalty?.earnedPoints || 0);
          const userUpdate = { loyaltyPoints: Math.max(0, Number(user.loyaltyPoints || 0) + used - earned), updatedAt: at };
          if (code) {
            userUpdate.usedPromoCodes = FieldValue.arrayRemove(code);
            if (user.promoCodeStatus && code in user.promoCodeStatus) userUpdate[`promoCodeStatus.${code}`] = 1;
          }
          tx.update(userRef, userUpdate);
        }
        if (promoSnap?.exists && Number(promoSnap.data().usedCount || 0) > 0) {
          tx.update(promoRef, { usedCount: FieldValue.increment(-1) });
        }
      }
      tx.update(bookingRef, update);
      return { ...booking, ...update, holdExpiresAt: undefined };
    });
  }

  // ---------------------------------------------------------------------------
  // Admin: check a ticket in at the cinema (QR payload or booking id).
  // ---------------------------------------------------------------------------
  function parseTicketCode(code) {
    const text = String(code || "").trim();
    const match = /BK-[A-Z0-9]{4,12}/i.exec(text);
    return match ? match[0].toUpperCase() : null;
  }

  async function checkIn({ code, adminUid, force = false }) {
    const bookingId = parseTicketCode(code);
    if (!bookingId) throw new HttpError(400, "รหัสตั๋วไม่ถูกต้อง");
    const bookingRef = col("bookings").doc(bookingId);
    return firestore.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) throw new HttpError(404, `ไม่พบการจอง ${bookingId}`);
      const booking = snap.data();
      const status = effectiveStatus(booking);
      if (status === BOOKING_STATUS.USED) {
        throw new HttpError(409, `ตั๋วนี้ถูกใช้ไปแล้วเมื่อ ${new Date(booking.checkedInAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`, { booking });
      }
      if (status !== BOOKING_STATUS.PAID) throw new HttpError(409, `ตั๋วนี้ใช้ไม่ได้ (สถานะ: ${status})`, { booking });
      const showDate = booking.showtime?.date;
      if (!force && showDate && showDate !== todayInBangkok()) {
        throw new HttpError(409, `ตั๋วนี้เป็นของรอบวันที่ ${thaiDateLabel(showDate)}`, { booking, canForce: true });
      }
      const at = nowIso();
      const update = { status: BOOKING_STATUS.USED, checkedInAt: at, checkedInBy: adminUid };
      tx.update(bookingRef, update);
      return { ...booking, ...update };
    });
  }

  return {
    col,
    getPricing,
    getUser,
    getBooking,
    getPromo,
    holdSeats,
    previewBooking,
    payBooking,
    startStripeCheckout,
    confirmStripePayment,
    cancelPending,
    expirePending,
    expireOverdueHolds,
    adminCancel,
    checkIn,
  };
}

module.exports = {
  createStore,
  readSeatState,
  effectiveStatus,
  presentBooking,
  movieTitle,
  normalizePromoCode,
  SEAT_TYPE_BY_CODE,
};
