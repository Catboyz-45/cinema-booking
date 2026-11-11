/**
 * One-time data setup / migration, tracked by meta/seed.version.
 *  v2: movies without embedded showtimes, dated showtimes for the next 7 days,
 *      cinemas, pricing settings, promotions, and v1 bookings marked as paid.
 *  v3: v1 movie docs that only had title/poster get titleThai/titleEng/backdropImage.
 */
const {
  todayInBangkok,
  addDays,
  parseDurationMinutes,
  formatDuration,
  minutesToTime,
  timeToMinutes,
  slugify,
} = require("./util");
const { DEFAULT_PRICING, DEFAULT_PROMOTIONS } = require("./domain");

const SEED_VERSION = 3;

// Garbled synopses from the first version of the sample data → replaced by the text in data/movies-data.js.
const GARBLED_DESCRIPTIONS = {
  "death-whisperer-2": "สลับปลิสิตจากการรายของแม่ ยักษ์ยดงคนอสำหมดสำหรับชีวิตส่วนของเรือศวนองเหยือจงไปสล่างไม่ลดสล่าง แม่",
  "hunger-games": "เกมการต่อสู้ที่ดุร้ายที่สำหรับเด็กควายศีลเข่างเข่างด้านการต่อสู้เพื่อความอยู่รอดของตัวเอง",
  "killers-of-the-flower-moon": "ภาพยนตร์มาตรฐานที่บรรยายปัญหาความลึกของการหลอก และการลักษณ์พิษของตลาดไข่มุกในเวลาสงครามสมัยโจ้ย",
  "trolls-band-together": "เอลฟ์สวนวิเศษภาพเรื่องน้อยน้อยเพลง และมิตรภาพหลังจากไผ่ทั่วนอกอความระบบ"
};
const SEED_DAYS = 7;

function loadCatalog() {
  try {
    // eslint-disable-next-line global-require
    const data = require("../data/movies-data.js");
    return { ...(data.moviesDatabase || {}), ...(data.additionalMovies || {}) };
  } catch (_error) {
    return {};
  }
}

function showtimeIdFor(movieId, date, time, hall) {
  return `st-${movieId}-${date.replace(/-/g, "")}-${time.replace(":", "")}-${slugify(hall) || "hall"}`;
}

async function writeIfMissing(firestore, refsWithData) {
  const chunkSize = 300;
  for (let i = 0; i < refsWithData.length; i += chunkSize) {
    const chunk = refsWithData.slice(i, i + chunkSize);
    const snaps = await firestore.getAll(...chunk.map(([ref]) => ref));
    const batch = firestore.batch();
    let writes = 0;
    snaps.forEach((snap, index) => {
      if (!snap.exists) {
        batch.set(chunk[index][0], chunk[index][1]);
        writes += 1;
      }
    });
    if (writes) await batch.commit();
  }
}

async function runSeed(firestore, { logger = console } = {}) {
  const metaRef = firestore.collection("meta").doc("seed");
  const meta = await metaRef.get();
  if (meta.exists && Number(meta.data().version) >= SEED_VERSION) return;

  logger.log(`Running data seed v${SEED_VERSION}...`);
  const now = new Date().toISOString();
  const catalog = loadCatalog();
  const today = todayInBangkok();

  // movies + cinemas + showtimes
  const movieWrites = [];
  const showtimeWrites = [];
  const cinemas = new Map();
  for (const movie of Object.values(catalog)) {
    if (!movie?.id) continue;
    const { showtimes = [], duration, ...rest } = movie;
    const durationMinutes = parseDurationMinutes(duration);
    movieWrites.push([firestore.collection("movies").doc(movie.id), {
      ...rest,
      durationMinutes,
      duration: formatDuration(durationMinutes),
      status: "now_showing",
      createdAt: now,
      updatedAt: now,
    }]);

    for (const cinema of showtimes) {
      const slug = slugify(cinema.cinema);
      if (!cinemas.has(slug)) {
        cinemas.set(slug, { id: slug, name: cinema.cinema, distance: cinema.distance || "", amenities: cinema.amenities || [], halls: new Set() });
      }
      for (const system of cinema.systems || []) {
        for (const slot of system.times || []) {
          cinemas.get(slug).halls.add(slot.hall);
          for (let day = 0; day < SEED_DAYS; day += 1) {
            const date = addDays(today, day);
            const id = showtimeIdFor(movie.id, date, slot.time, slot.hall);
            showtimeWrites.push([firestore.collection("showtimes").doc(id), {
              id,
              movieId: movie.id,
              cinema: cinema.cinema,
              hall: slot.hall,
              format: system.format || "",
              type: system.type || "",
              date,
              startTime: slot.time,
              endTime: minutesToTime(timeToMinutes(slot.time) + durationMinutes),
              status: "active",
              createdAt: now,
            }]);
          }
        }
      }
    }
  }
  const cinemaWrites = [...cinemas.values()].map((c) => [
    firestore.collection("cinemas").doc(c.id),
    { ...c, halls: [...c.halls].sort(), createdAt: now },
  ]);

  await writeIfMissing(firestore, movieWrites);
  await writeIfMissing(firestore, cinemaWrites);
  await writeIfMissing(firestore, showtimeWrites);
  await writeIfMissing(firestore, [[firestore.collection("settings").doc("pricing"), { ...DEFAULT_PRICING, updatedAt: now }]]);
  await writeIfMissing(firestore, DEFAULT_PROMOTIONS.map((promo) => [
    firestore.collection("promotions").doc(promo.code),
    { ...promo, startDate: null, endDate: null, totalLimit: 0, usedCount: 0, createdAt: now },
  ]));

  // v1 movie docs (from the original movies-data) may lack status/durationMinutes.
  const existingMovies = await firestore.collection("movies").get();
  let batch = firestore.batch();
  let pending = 0;
  const flush = async () => {
    if (pending) await batch.commit();
    batch = firestore.batch();
    pending = 0;
  };
  for (const doc of existingMovies.docs) {
    const data = doc.data();
    const patch = {};
    if (GARBLED_DESCRIPTIONS[doc.id] && data.description === GARBLED_DESCRIPTIONS[doc.id] && catalog[doc.id]?.description) {
      patch.description = catalog[doc.id].description;
    }
    if (!data.titleThai) {
      const source = catalog[doc.id];
      if (source) {
        const { showtimes: _showtimes, duration: _duration, ...fields } = source;
        Object.assign(patch, fields);
      } else {
        const title = data.title || doc.id;
        Object.assign(patch, {
          titleThai: title,
          titleEng: data.titleEng || title,
          backdropImage: data.backdropImage || data.poster || "",
          trailerImage: data.trailerImage || data.poster || "",
          description: data.description || "",
          genres: Array.isArray(data.genres) ? data.genres : [],
          cast: Array.isArray(data.cast) ? data.cast : [],
        });
      }
    }
    if (!data.status) patch.status = "now_showing";
    if (!data.durationMinutes) patch.durationMinutes = parseDurationMinutes(data.duration);
    if (Array.isArray(data.showtimes)) patch.showtimes = null;
    if (Object.keys(patch).length) {
      batch.set(doc.ref, patch, { merge: true });
      pending += 1;
    }
    if (pending >= 400) await flush();
  }
  await flush();

  // v1 showtimes had no date ("วันนี้") → hide them from the catalog.
  const legacyShowtimes = await firestore.collection("showtimes").get();
  for (const doc of legacyShowtimes.docs) {
    if (!doc.data().date) {
      batch.set(doc.ref, { status: "legacy" }, { merge: true });
      pending += 1;
      if (pending >= 400) await flush();
    }
  }
  await flush();

  // v1 bookings were paid immediately and had no status / top-level ids.
  const legacyBookings = await firestore.collection("bookings").get();
  for (const doc of legacyBookings.docs) {
    const data = doc.data();
    if (data.status) continue;
    batch.set(doc.ref, {
      status: "paid",
      paidAt: data.createdAt || now,
      showtimeId: data.showtime?.id || null,
      showtimeDate: data.showtime?.date || null,
      movieId: data.showtime?.movieId || data.movie?.id || null,
    }, { merge: true });
    pending += 1;
    if (pending >= 400) await flush();
  }
  await flush();

  await metaRef.set({ version: SEED_VERSION, seededAt: now });
  logger.log("Data seed complete.");
}

module.exports = { runSeed, showtimeIdFor, SEED_VERSION };
