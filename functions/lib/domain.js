const { todayInBangkok, bangkokWeekday } = require("./util");

// ---- Seat layout (matches public/seat-selection.html) ----
const SEAT_ROWS = [
  { row: "A", count: 3, type: "Sofa Pair" },
  { row: "B", count: 7, type: "Premium" },
  { row: "C", count: 7, type: "Regular" },
  { row: "D", count: 7, type: "Regular" },
];
const SEAT_TYPE_BY_CODE = {};
for (const { row, count, type } of SEAT_ROWS) {
  for (let i = 1; i <= count; i += 1) SEAT_TYPE_BY_CODE[`${row}${i}`] = type;
}
const ALL_SEATS = Object.keys(SEAT_TYPE_BY_CODE);
const HALL_CAPACITY = ALL_SEATS.length;
const MAX_SEATS_PER_BOOKING = 10;
const SHOWTIME_CLEANUP_MINUTES = 15;

// Seats that the first version of the app marked as "sold" for demo purposes.
const LEGACY_BLOCKED_SEATS = new Set(["A3", "B6", "B7"]);

const BOOKING_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  USED: "used",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};
const ACTIVE_BOOKING_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.PAID, BOOKING_STATUS.USED];
const REVENUE_STATUSES = [BOOKING_STATUS.PAID, BOOKING_STATUS.USED];
const MOVIE_STATUSES = ["now_showing", "coming_soon", "archived"];
const PAYMENT_METHODS = ["card", "qr", "ewallet"];

const DEFAULT_PRICING = {
  seatPrices: { "Sofa Pair": 500, Premium: 350, Regular: 240 },
  serviceFeePerSeat: 20,
  holdMinutes: 12,
  loyalty: {
    signupBonus: 250,
    pointsRequired: 80,
    pointDiscount: 30,
    pointsEarnedPerBooking: 50,
  },
};

const DEFAULT_PROMOTIONS = [
  {
    code: "FREE100",
    description: "ลด 100 บาท ใช้ได้ 1 ครั้งต่อบัญชี",
    discountType: "amount",
    discountValue: 100,
    daysOfWeek: [],
    active: true,
  },
  {
    code: "MONDAY100",
    description: "ลด 100 บาท เฉพาะวันจันทร์ ใช้ได้ 1 ครั้งต่อบัญชี",
    discountType: "amount",
    discountValue: 100,
    daysOfWeek: [1],
    active: true,
  },
];

const THAI_DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function normalizePricing(raw = {}) {
  const seatPrices = { ...DEFAULT_PRICING.seatPrices };
  for (const type of Object.keys(seatPrices)) {
    const value = Number(raw?.seatPrices?.[type]);
    if (Number.isFinite(value) && value >= 0) seatPrices[type] = Math.round(value);
  }
  const pick = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : fallback);
  const loyaltyRaw = raw.loyalty || {};
  return {
    seatPrices,
    serviceFeePerSeat: pick(raw.serviceFeePerSeat, DEFAULT_PRICING.serviceFeePerSeat),
    holdMinutes: Math.min(60, Math.max(3, pick(raw.holdMinutes, DEFAULT_PRICING.holdMinutes))),
    loyalty: {
      signupBonus: pick(loyaltyRaw.signupBonus, DEFAULT_PRICING.loyalty.signupBonus),
      pointsRequired: pick(loyaltyRaw.pointsRequired, DEFAULT_PRICING.loyalty.pointsRequired),
      pointDiscount: pick(loyaltyRaw.pointDiscount, DEFAULT_PRICING.loyalty.pointDiscount),
      pointsEarnedPerBooking: pick(loyaltyRaw.pointsEarnedPerBooking, DEFAULT_PRICING.loyalty.pointsEarnedPerBooking),
    },
  };
}

function validateSeats(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return { ok: false, message: "กรุณาเลือกที่นั่ง" };
  const normalized = seats.map((seat) => String(seat || "").trim().toUpperCase());
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) return { ok: false, message: "เลือกที่นั่งซ้ำกัน" };
  if (normalized.length > MAX_SEATS_PER_BOOKING) {
    return { ok: false, message: `จองได้สูงสุด ${MAX_SEATS_PER_BOOKING} ที่นั่งต่อครั้ง` };
  }
  const invalid = normalized.filter((seat) => !SEAT_TYPE_BY_CODE[seat]);
  if (invalid.length) return { ok: false, message: `ไม่มีที่นั่ง ${invalid.join(", ")} ในโรงนี้` };
  return { ok: true, seats: normalized };
}

function userHasUsedPromo(user, code) {
  if (!user || !code) return false;
  if (Array.isArray(user.usedPromoCodes) && user.usedPromoCodes.includes(code)) return true;
  const legacy = user.promoCodeStatus?.[code];
  return legacy === 0 || legacy === "0";
}

/** Returns null when the promotion can be used, otherwise a Thai error message. */
function promoProblem(promo, code, user, now = new Date()) {
  if (!promo || !promo.active) return "โค้ดไม่ถูกต้อง";
  const today = todayInBangkok(now);
  if (promo.startDate && today < promo.startDate) return "โค้ดนี้ยังไม่เริ่มใช้งาน";
  if (promo.endDate && today > promo.endDate) return "โค้ดนี้หมดอายุแล้ว";
  const days = Array.isArray(promo.daysOfWeek) ? promo.daysOfWeek : [];
  if (days.length && !days.includes(bangkokWeekday(now))) {
    return `โค้ด ${code} ใช้ได้เฉพาะวัน${days.map((d) => THAI_DAY_NAMES[d]).join(", ")}`;
  }
  if (Number(promo.totalLimit) > 0 && Number(promo.usedCount || 0) >= Number(promo.totalLimit)) {
    return "โค้ดนี้ถูกใช้ครบจำนวนแล้ว";
  }
  if (userHasUsedPromo(user, code)) return "โค้ดนี้ถูกใช้ไปแล้ว";
  return null;
}

function calculatePricing({ seats, pricing, promo = null, usePoints = false, availablePoints = 0 }) {
  const lines = seats.map((seatCode) => {
    const type = SEAT_TYPE_BY_CODE[seatCode] || "Regular";
    return { seatCode, type, unitPrice: pricing.seatPrices[type] ?? pricing.seatPrices.Regular };
  });
  const seatSubtotal = lines.reduce((sum, line) => sum + line.unitPrice, 0);
  const serviceFee = seats.length * pricing.serviceFeePerSeat;
  const gross = seatSubtotal + serviceFee;

  let promoDiscount = 0;
  if (promo) {
    const value = Number(promo.discountValue || 0);
    promoDiscount = promo.discountType === "percent" ? Math.floor((gross * value) / 100) : value;
    promoDiscount = Math.max(0, Math.min(promoDiscount, gross));
  }

  const { pointsRequired, pointDiscount } = pricing.loyalty;
  const canUsePoints = Number(availablePoints) >= pointsRequired;
  let pointsDiscount = 0;
  if (usePoints && canUsePoints) pointsDiscount = Math.max(0, Math.min(pointDiscount, gross - promoDiscount));
  const usedPoints = pointsDiscount > 0 ? pointsRequired : 0;

  const discount = promoDiscount + pointsDiscount;
  return {
    lines,
    seatSubtotal,
    serviceFee,
    promoDiscount,
    pointsDiscount,
    discount,
    total: Math.max(0, gross - discount),
    usedPoints,
  };
}

module.exports = {
  SEAT_ROWS,
  SEAT_TYPE_BY_CODE,
  ALL_SEATS,
  HALL_CAPACITY,
  MAX_SEATS_PER_BOOKING,
  SHOWTIME_CLEANUP_MINUTES,
  LEGACY_BLOCKED_SEATS,
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  REVENUE_STATUSES,
  MOVIE_STATUSES,
  PAYMENT_METHODS,
  DEFAULT_PRICING,
  DEFAULT_PROMOTIONS,
  THAI_DAY_NAMES,
  normalizePricing,
  validateSeats,
  userHasUsedPromo,
  promoProblem,
  calculatePricing,
};
