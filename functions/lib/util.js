const crypto = require("crypto");

const TIME_ZONE = "Asia/Bangkok";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// ---- Dates (all business dates are in Asia/Bangkok) ----
function todayInBangkok(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function bangkokWeekday(date = new Date()) {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).getUTCDay();
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(from, to, maxDays = 62) {
  const dates = [];
  let current = from;
  while (current <= to && dates.length < maxDays) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function bangkokToUtcIso(dateStr, time = "00:00") {
  return new Date(`${dateStr}T${time}:00+07:00`).toISOString();
}

function showtimeStartsAt(showtime) {
  if (!showtime?.date || !showtime?.startTime) return null;
  return new Date(`${showtime.date}T${showtime.startTime}:00+07:00`);
}

function timeToMinutes(time) {
  const [h, m] = String(time || "").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function thaiDateLabel(dateStr) {
  if (!isValidDate(dateStr)) return String(dateStr || "");
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

function parseDurationMinutes(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Math.round(Number(value));
  const text = String(value || "");
  const hours = Number((/(\d+)\s*ชม/.exec(text) || [])[1] || 0);
  const minutes = Number((/(\d+)\s*นาที/.exec(text) || [])[1] || 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : 120;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ชม. ${m} นาที`;
  if (h) return `${h} ชม.`;
  return `${m} นาที`;
}

// ---- Strings / ids ----
function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function toStringList(value, maxItems = 20) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return list.map((item) => cleanString(item, 100)).filter(Boolean).slice(0, maxItems);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  TIME_ZONE,
  HttpError,
  asyncHandler,
  todayInBangkok,
  bangkokWeekday,
  isValidDate,
  isValidTime,
  addDays,
  dateRange,
  bangkokToUtcIso,
  showtimeStartsAt,
  timeToMinutes,
  minutesToTime,
  thaiDateLabel,
  parseDurationMinutes,
  formatDuration,
  slugify,
  randomCode,
  cleanString,
  toStringList,
  escapeHtml,
};
