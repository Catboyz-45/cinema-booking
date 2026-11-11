/**
 * Stripe Checkout (test mode / sandbox).
 * Enabled when STRIPE_SECRET_KEY is set (functions/.env, never committed).
 * Without it the API falls back to the simulated payment used in tests.
 */
const { HttpError } = require("./util");

// Stripe requires a Checkout Session to stay open for at least 30 minutes.
const STRIPE_SESSION_MINUTES = 30;
// Seats stay locked a little longer than the session so a last-second payment still finds them.
const STRIPE_HOLD_MINUTES = STRIPE_SESSION_MINUTES + 2;
const MIN_THB_CHARGE = 10; // Stripe's minimum charge in THB

const DEFAULT_ALLOWED_ORIGINS = [
  "https://my-web-project-491413.web.app",
  "https://my-web-project-491413.firebaseapp.com",
  "https://cinema-booking-02739322.vercel.app",
];

function createPayments({ secretKey = process.env.STRIPE_SECRET_KEY, allowedOrigins = process.env.ALLOWED_ORIGINS } = {}) {
  const key = String(secretKey || "").trim();
  if (key.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY is a live key. This project only supports Stripe test mode (sk_test_...).");
  }
  // eslint-disable-next-line global-require
  const stripe = key ? new (require("stripe"))(key) : null;
  const origins = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...String(allowedOrigins || "").split(",").map((o) => o.trim()).filter(Boolean),
  ]);

  /** Only redirect back to our own site (avoid open redirects through success_url). */
  function safeOrigin(origin) {
    const value = String(origin || "").replace(/\/+$/, "");
    if (origins.has(value)) return value;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value)) return value;
    return DEFAULT_ALLOWED_ORIGINS[0];
  }

  function requireStripe() {
    if (!stripe) throw new HttpError(400, "ยังไม่ได้ตั้งค่าระบบชำระเงิน Stripe");
    return stripe;
  }

  async function createCheckoutSession({ booking, pricing, email, origin }) {
    const client = requireStripe();
    if (pricing.total < MIN_THB_CHARGE) {
      throw new HttpError(400, `ยอดชำระผ่าน Stripe ต้องไม่ต่ำกว่า ${MIN_THB_CHARGE} บาท`);
    }
    const site = safeOrigin(origin);
    const bookingParam = encodeURIComponent(booking.bookingId);
    const params = {
      mode: "payment",
      client_reference_id: booking.bookingId,
      customer_email: email || undefined,
      expires_at: Math.floor(Date.now() / 1000) + STRIPE_SESSION_MINUTES * 60,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "thb",
          unit_amount: Math.round(pricing.total * 100),
          product_data: {
            name: `ตั๋วภาพยนตร์ ${booking.movie.title}`,
            description: `${booking.showtime.dateLabel} ${booking.showtime.startTime} • ${booking.showtime.cinema} ${booking.showtime.hall} • ที่นั่ง ${booking.seats.join(", ")}`,
          },
        },
      }],
      metadata: { bookingId: booking.bookingId, uid: booking.uid },
      payment_intent_data: { metadata: { bookingId: booking.bookingId } },
      success_url: `${site}/booking-confirmation.html?bookingId=${bookingParam}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/checkout.html?bookingId=${bookingParam}&canceled=1`,
    };
    // Payment methods (card, PromptPay, ...) are chosen in Stripe Dashboard → Settings → Payment methods.
    return client.checkout.sessions.create(params);
  }

  async function retrieveSession(sessionId) {
    return requireStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.payment_method"] });
  }

  async function expireSession(sessionId) {
    if (!stripe || !sessionId) return;
    try {
      await stripe.checkout.sessions.expire(sessionId);
    } catch (_error) {
      // already completed or expired
    }
  }

  async function refund(paymentIntentId) {
    return requireStripe().refunds.create({ payment_intent: paymentIntentId });
  }

  /** Summarise a paid Checkout Session for the booking document. */
  function paymentFromSession(session) {
    const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
    const method = intent?.payment_method;
    const type = method?.type || session.payment_method_types?.[0] || "card";
    return {
      method: type === "promptpay" ? "qr" : "card",
      cardLast4: method?.card?.last4 || null,
      cardBrand: method?.card?.brand || null,
      status: "paid",
      amount: (session.amount_total || 0) / 100,
      transactionId: intent?.id || session.payment_intent || session.id,
      sessionId: session.id,
      gateway: "stripe",
      testMode: session.livemode === false,
    };
  }

  return {
    enabled: Boolean(stripe),
    createCheckoutSession,
    retrieveSession,
    expireSession,
    refund,
    paymentFromSession,
    safeOrigin,
  };
}

module.exports = { createPayments, STRIPE_HOLD_MINUTES, STRIPE_SESSION_MINUTES, MIN_THB_CHARGE };
