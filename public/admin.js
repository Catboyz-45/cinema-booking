// Admin back office (admin.html). All data goes through /api/admin/* which checks the admin role.
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';

const api = window.cinemaApi;
const esc = api.escapeHtml;
const $ = (selector) => document.querySelector(selector);

const DAY_NAMES = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MOVIE_STATUS = {
    now_showing: { text: 'กำลังฉาย', className: 'bg-emerald-100 text-emerald-800' },
    coming_soon: { text: 'โปรแกรมหน้า', className: 'bg-sky-100 text-sky-800' },
    archived: { text: 'เก็บถาวร', className: 'bg-slate-200 text-slate-600' }
};

let me = null;
let moviesCache = [];
let cinemasCache = [];
const reportData = {};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function todayBangkok() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

const money = (value) => `฿${Number(value || 0).toLocaleString('th-TH')}`;
const dateTh = (dateStr) => api.formatThaiDate(dateStr, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
const dateTimeTh = (iso) => (iso ? new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : '-');
const movieTitle = (movie) => movie?.titleThai || movie?.titleEng || movie?.id || '';

function badge(text, className) {
    return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold ${className}">${esc(text)}</span>`;
}

let toastTimer = null;
function toast(message, type = 'success') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `no-print fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function openModal(title, html) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html.includes('modal-actions') ? html : `${html}<div class="h-5"></div>`;
    $('#modal-body').scrollTop = 0;
    // give modal form fields an accessible name from the label above them
    $('#modal-body').querySelectorAll('.label + .field').forEach((field) => {
        field.setAttribute('aria-label', field.previousElementSibling.textContent.replace('*', '').trim());
    });
    $('#modal').classList.remove('hidden');
    $('#modal-body').querySelector('input:not([readonly]), select, textarea')?.focus();
}

function closeModal() {
    $('#modal').classList.add('hidden');
    $('#modal-body').innerHTML = '';
}

function emptyRow(message, colspan = 10) {
    return `<tr><td class="text-center text-slate-500 py-8" colspan="${colspan}">${esc(message)}</td></tr>`;
}

function loading(target) {
    target.innerHTML = '<p class="p-6 text-sm text-slate-500">กำลังโหลด...</p>';
}

async function withButton(button, task) {
    if (button) button.disabled = true;
    try {
        return await task();
    } catch (error) {
        toast(error.message || 'เกิดข้อผิดพลาด', 'error');
        return null;
    } finally {
        if (button) button.disabled = false;
    }
}

function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`; // avoid spreadsheet formula injection
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
    const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function printOnly(elementId) {
    const hidden = [];
    document.querySelectorAll('section[data-panel="reports"] > *').forEach((el) => {
        if (el.id !== elementId) {
            el.classList.add('print-hide');
            hidden.push(el);
        }
    });
    window.addEventListener('afterprint', () => hidden.forEach((el) => el.classList.remove('print-hide')), { once: true });
    window.print();
}

// ---------------------------------------------------------------------------
// gate + routing
// ---------------------------------------------------------------------------
function showGate(mode, message) {
    $('#app').classList.add('hidden');
    $('#gate').classList.remove('hidden');
    $('#gate-login').classList.toggle('hidden', mode !== 'login');
    $('#gate-denied').classList.toggle('hidden', mode !== 'denied');
    $('#gate-message').textContent = message;
}

const loaders = {
    dashboard: loadDashboard,
    movies: loadMovies,
    showtimes: loadShowtimesPanel,
    bookings: () => searchBookings(),
    reports: () => {},
    pricing: loadPricing,
    promotions: loadPromotions,
    users: loadUsers
};

function route() {
    const tab = (window.location.hash || '#dashboard').slice(1);
    const active = loaders[tab] ? tab : 'dashboard';
    document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== active));
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === active));
    if (active !== 'bookings') stopScanner();
    loaders[active]();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showGate('login', 'เข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ');
        return;
    }
    try {
        me = await api.request('/api/me');
    } catch (error) {
        showGate('denied', error.message);
        return;
    }
    if (me.role !== 'admin') {
        showGate('denied', `บัญชี ${user.email} ไม่มีสิทธิ์ผู้ดูแลระบบ`);
        return;
    }
    $('#gate').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#admin-email').textContent = user.email;
    route();
});

$('#gate-login').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#gate-error').textContent = '';
    try {
        await signInWithEmailAndPassword(auth, $('#gate-email').value.trim(), $('#gate-password').value);
    } catch (_error) {
        $('#gate-error').textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    }
});
$('#gate-logout').addEventListener('click', () => signOut(auth));
$('#logout-btn').addEventListener('click', () => signOut(auth));
$('#logout-btn-mobile').addEventListener('click', () => signOut(auth));
window.addEventListener('hashchange', route);
document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => { window.location.hash = btn.dataset.tab; }));
document.querySelectorAll('[data-reload]').forEach((btn) => btn.addEventListener('click', () => loaders[btn.dataset.reload]()));
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------
function occupancyBar(booked, held, capacity) {
    const bookedPct = Math.round((booked / capacity) * 100);
    const heldPct = Math.round((held / capacity) * 100);
    return `<div class="flex items-center gap-2 min-w-[9rem]">
        <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden flex">
            <div class="bg-primary" style="width:${bookedPct}%"></div><div class="bg-amber-300" style="width:${heldPct}%"></div>
        </div>
        <span class="text-xs text-slate-600 tabular-nums">${booked}/${capacity}</span>
    </div>`;
}

async function loadDashboard() {
    const today = todayBangkok();
    $('#dash-date').textContent = api.formatThaiDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    loading($('#dash-showtimes'));
    try {
        const [summary, report] = await Promise.all([
            api.request('/api/admin/summary'),
            api.request(`/api/admin/reports/showtimes?date=${today}`)
        ]);
        const cards = [
            ['payments', 'รายได้วันนี้', money(summary.todayRevenue)],
            ['confirmation_number', 'ตั๋วที่ขายวันนี้', `${summary.todayTickets} ใบ`],
            ['receipt_long', 'การจองวันนี้', `${summary.todayBookings} รายการ`],
            ['calendar_month', 'รอบฉายวันนี้', `${summary.showtimesToday} รอบ`],
            ['hourglass_top', 'รอชำระเงิน', `${summary.pendingHolds} รายการ`]
        ];
        $('#dash-cards').innerHTML = cards.map(([icon, label, value]) => `
            <div class="card p-4">
                <div class="flex items-center gap-2 text-slate-500 text-xs font-bold"><span class="material-symbols-outlined text-base text-primary">${icon}</span>${label}</div>
                <p class="text-xl font-black mt-2 tabular-nums">${esc(value)}</p>
            </div>`).join('');

        const max = Math.max(1, ...summary.series.map((row) => row.revenue));
        $('#dash-chart').innerHTML = summary.series.map((row) => `
            <div class="flex-1 h-full flex flex-col justify-end items-center gap-1" title="${esc(`${dateTh(row.date)}: ${money(row.revenue)} (${row.tickets} ใบ)`)}">
                <span class="text-[10px] text-slate-500 tabular-nums">${row.revenue ? Number(row.revenue).toLocaleString('th-TH') : ''}</span>
                <div class="w-full max-w-[3rem] rounded-t-md ${row.date === today ? 'bg-primary' : 'bg-primary/40'}" style="height:${Math.max(2, Math.round((row.revenue / max) * 100))}%"></div>
                <span class="text-[11px] text-slate-500">${esc(api.formatThaiDate(row.date, { weekday: 'short', day: 'numeric' }))}</span>
            </div>`).join('');

        $('#dash-top').innerHTML = summary.topMovies.length
            ? `<ol class="space-y-3">${summary.topMovies.map((movie, index) => `
                <li class="flex items-center gap-3">
                    <span class="w-6 h-6 rounded-full bg-slate-100 text-xs font-black flex items-center justify-center">${index + 1}</span>
                    <div class="flex-1 min-w-0"><p class="font-semibold truncate">${esc(movie.title)}</p><p class="text-xs text-slate-500">${movie.tickets} ใบ</p></div>
                    <span class="text-sm font-bold tabular-nums">${money(movie.revenue)}</span>
                </li>`).join('')}</ol>`
            : '<p class="text-sm text-slate-500">ยังไม่มียอดขายใน 7 วันนี้</p>';

        $('#dash-showtimes').innerHTML = `<table class="table">
            <thead><tr><th>เวลา</th><th>ภาพยนตร์</th><th>โรง</th><th>ที่นั่ง (จองแล้ว / รอชำระ)</th><th class="num">เช็คอินแล้ว</th><th class="num">รายได้</th></tr></thead>
            <tbody>${report.rows.length ? report.rows.map((row) => `
                <tr class="${row.status !== 'active' ? 'opacity-50' : ''}">
                    <td class="font-semibold tabular-nums">${esc(row.startTime)}-${esc(row.endTime)}</td>
                    <td>${esc(row.movieTitle)}</td>
                    <td>${esc(row.cinema)}<br><span class="text-xs text-slate-500">${esc(row.hall)}</span></td>
                    <td>${occupancyBar(row.booked, row.held, row.capacity)}</td>
                    <td class="num">${row.checkedIn}</td>
                    <td class="num">${money(row.revenue)}</td>
                </tr>`).join('') : emptyRow('วันนี้ไม่มีรอบฉาย', 6)}</tbody></table>`;
    } catch (error) {
        toast(error.message, 'error');
    }
}

// ---------------------------------------------------------------------------
// movies
// ---------------------------------------------------------------------------
async function fetchMovies() {
    moviesCache = await api.request('/api/admin/movies');
    return moviesCache;
}

function renderMoviesTable() {
    const keyword = $('#movie-search').value.trim().toLowerCase();
    const rows = moviesCache.filter((movie) => !keyword
        || `${movie.titleThai} ${movie.titleEng} ${movie.id}`.toLowerCase().includes(keyword));
    $('#movies-table').innerHTML = `<table class="table">
        <thead><tr><th></th><th>ชื่อเรื่อง</th><th>ประเภท</th><th>ความยาว</th><th>เรต</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map((movie) => {
            const status = MOVIE_STATUS[movie.status] || MOVIE_STATUS.now_showing;
            const poster = movie.posterImage || movie.backdropImage || '';
            return `<tr>
                <td class="w-14">${poster ? `<img src="${esc(poster)}" alt="" class="w-10 h-14 object-cover rounded bg-slate-100" loading="lazy">` : '<div class="w-10 h-14 rounded bg-slate-100"></div>'}</td>
                <td><p class="font-semibold">${esc(movie.titleThai)}</p><p class="text-xs text-slate-500">${esc(movie.titleEng || '')} • <code>${esc(movie.id)}</code></p></td>
                <td class="text-slate-600">${esc((movie.genres || []).join(', '))}</td>
                <td class="whitespace-nowrap">${movie.durationMinutes ? `${movie.durationMinutes} นาที` : '-'}</td>
                <td>${esc(movie.ageLimit || '-')}</td>
                <td>${badge(status.text, status.className)}</td>
                <td class="whitespace-nowrap text-right">
                    <button class="btn btn-ghost btn-sm" data-edit-movie="${esc(movie.id)}" type="button">แก้ไข</button>
                    <button class="btn btn-danger btn-sm" data-delete-movie="${esc(movie.id)}" type="button">ลบ</button>
                </td>
            </tr>`;
        }).join('') : emptyRow('ไม่พบภาพยนตร์', 7)}</tbody></table>`;
}

async function loadMovies() {
    loading($('#movies-table'));
    try {
        await fetchMovies();
        renderMoviesTable();
    } catch (error) {
        toast(error.message, 'error');
    }
}

const DEFAULT_GENRES = ['แอ็คชัน', 'ผจญภัย', 'คอมเมดี้', 'ดราม่า', 'สยองขวัญ', 'ระทึกขวัญ', 'ไซไฟ', 'แฟนตาซี', 'แอนิเมชัน', 'โรแมนติก', 'ครอบครัว', 'อาชญากรรม'];
const AGE_RATINGS = ['G', 'PG', '13+', '15+', '18+', '20+'];

function durationText(minutes) {
    const total = Number(minutes);
    if (!Number.isFinite(total) || total <= 0) return '';
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `= ${h ? `${h} ชม. ` : ''}${m ? `${m} นาที` : ''}`.trim();
}

/** "24 Oct 2024" (stored text) <-> "2024-10-24" (date input) */
function releaseToInput(text) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text || '')) return text;
    const parsed = Date.parse(`${text} UTC`);
    return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
}
function inputToRelease(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function castRowHtml(actor = {}) {
    return `<div class="cast-row grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-start">
        <input class="field" data-cast="name" placeholder="ชื่อนักแสดง" value="${esc(actor.name || '')}" aria-label="ชื่อนักแสดง">
        <input class="field" data-cast="role" placeholder="บทบาท" value="${esc(actor.role || '')}" aria-label="บทบาท">
        <input class="field col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto" data-cast="image" placeholder="ลิงก์รูป https:// (ไม่บังคับ)" value="${esc(actor.image || '')}" aria-label="ลิงก์รูปนักแสดง">
        <button class="btn btn-ghost btn-sm !px-2 h-[2.4rem]" type="button" data-remove-cast aria-label="ลบนักแสดงคนนี้"><span class="material-symbols-outlined text-base">delete</span></button>
    </div>`;
}

function movieForm(movie = {}) {
    const status = movie.status || 'now_showing';
    const genres = new Set(movie.genres || []);
    const genreOptions = [...new Set([...DEFAULT_GENRES, ...moviesCache.flatMap((m) => m.genres || []), ...genres])];
    const ratings = movie.ageLimit && !AGE_RATINGS.includes(movie.ageLimit) ? [...AGE_RATINGS, movie.ageLimit] : AGE_RATINGS;
    return `<form id="movie-form" class="space-y-4" novalidate>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">movie</span>ข้อมูลหลัก</h4>
            <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="label" for="mf-titleThai">ชื่อภาษาไทย <span class="text-rose-600">*</span></label>
                    <input class="field" id="mf-titleThai" name="titleThai" value="${esc(movie.titleThai || '')}" placeholder="เช่น ธี่หยด 2" autocomplete="off"></div>
                <div><label class="label" for="mf-titleEng">ชื่อภาษาอังกฤษ</label>
                    <input class="field" id="mf-titleEng" name="titleEng" value="${esc(movie.titleEng || '')}" placeholder="เช่น Death Whisperer 2" autocomplete="off"></div>
                <div><label class="label" for="mf-duration">ความยาว <span class="text-rose-600">*</span></label>
                    <div class="flex items-center gap-2">
                        <input class="field w-28" id="mf-duration" name="durationMinutes" type="number" inputmode="numeric" min="30" max="400" value="${esc(movie.durationMinutes || '')}" placeholder="120">
                        <span class="text-sm text-slate-500">นาที</span>
                        <span class="text-sm font-semibold text-slate-700" id="mf-duration-text">${esc(durationText(movie.durationMinutes))}</span>
                    </div></div>
                <div><label class="label" for="mf-release">วันเข้าฉาย</label>
                    <input class="field" id="mf-release" type="date" value="${esc(releaseToInput(movie.releaseDate))}"></div>
                <div><span class="label">เรต</span>
                    <div class="segmented" role="group" aria-label="เรต" id="mf-age">
                        <button type="button" data-value="" aria-pressed="${!movie.ageLimit}">ไม่ระบุ</button>
                        ${ratings.map((r) => `<button type="button" data-value="${esc(r)}" aria-pressed="${movie.ageLimit === r}">${esc(r)}</button>`).join('')}
                    </div></div>
                <div><span class="label">สถานะ</span>
                    <div class="segmented" role="group" aria-label="สถานะ" id="mf-status">
                        ${Object.entries(MOVIE_STATUS).map(([value, info]) => `<button type="button" data-value="${value}" aria-pressed="${value === status}">${info.text}</button>`).join('')}
                    </div>
                    <p class="hint">"เก็บถาวร" = ซ่อนจากหน้าเว็บ</p></div>
                <div class="sm:col-span-2"><span class="label">ประเภท (เลือกได้หลายแบบ)</span>
                    <div class="flex flex-wrap gap-2" id="mf-genres">
                        ${genreOptions.map((g) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${genres.has(g)}">${esc(g)}</button>`).join('')}
                    </div>
                    <div class="flex gap-2 mt-2">
                        <input class="field max-w-[14rem]" id="mf-genre-new" placeholder="เพิ่มประเภทอื่น" aria-label="เพิ่มประเภทอื่น">
                        <button class="btn btn-ghost btn-sm" type="button" id="mf-genre-add"><span class="material-symbols-outlined text-base">add</span>เพิ่ม</button>
                    </div></div>
                <div class="sm:col-span-2"><label class="label" for="mf-description">เรื่องย่อ</label>
                    <textarea class="field" id="mf-description" name="description" rows="3" maxlength="3000" placeholder="เล่าเรื่องย่อสั้น ๆ 1-3 ประโยค">${esc(movie.description || '')}</textarea>
                    <p class="hint text-right"><span id="mf-description-count">${(movie.description || '').length}</span>/3000</p></div>
            </div>
        </section>

        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">image</span>รูปภาพ <span class="font-normal text-slate-500">(วางลิงก์รูปที่ขึ้นต้นด้วย https://)</span></h4>
            <div class="grid sm:grid-cols-[7rem_1fr] gap-4 items-start">
                <div class="img-preview w-28 aspect-[2/3]" id="mf-poster-preview">ยังไม่มีโปสเตอร์</div>
                <div class="space-y-3">
                    <div><label class="label" for="mf-poster">โปสเตอร์ (แนวตั้ง)</label>
                        <input class="field" id="mf-poster" name="posterImage" value="${esc(movie.posterImage || '')}" placeholder="https://..." inputmode="url"></div>
                    <div><label class="label" for="mf-backdrop">ภาพพื้นหลัง (แนวนอน)</label>
                        <input class="field" id="mf-backdrop" name="backdropImage" value="${esc(movie.backdropImage || '')}" placeholder="https://..." inputmode="url">
                        <div class="img-preview w-full max-w-xs aspect-video mt-2" id="mf-backdrop-preview">ยังไม่มีภาพพื้นหลัง</div></div>
                    <p class="hint">ถ้าไม่ใส่ ระบบจะลองหาโปสเตอร์ให้อัตโนมัติจากชื่อภาษาอังกฤษ</p>
                </div>
            </div>
        </section>

        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">groups</span>นักแสดง <span class="font-normal text-slate-500">(ไม่บังคับ)</span></h4>
            <div class="space-y-2" id="mf-cast">${(movie.cast || []).map(castRowHtml).join('')}</div>
            <button class="btn btn-ghost btn-sm mt-2" type="button" id="mf-cast-add"><span class="material-symbols-outlined text-base">person_add</span>เพิ่มนักแสดง</button>
        </section>

        <details class="form-section">
            <summary class="text-sm font-bold cursor-pointer select-none">ข้อมูลเพิ่มเติม (ไม่บังคับ)</summary>
            <div class="grid sm:grid-cols-3 gap-4 mt-3">
                <div><label class="label" for="mf-rating">คะแนน (เต็ม 10)</label><input class="field" id="mf-rating" name="rating" value="${esc(movie.rating || '')}" placeholder="8.5" inputmode="decimal"></div>
                <div><label class="label" for="mf-reviews">จำนวนรีวิว</label><input class="field" id="mf-reviews" name="reviews" value="${esc(movie.reviews || '')}" placeholder="12k"></div>
                <div><label class="label" for="mf-trailer">ภาพตัวอย่างหนัง</label><input class="field" id="mf-trailer" name="trailerImage" value="${esc(movie.trailerImage || '')}" placeholder="https://..."></div>
            </div>
        </details>

        <div class="modal-actions">
            <button class="btn btn-ghost" type="button" data-close-modal>ยกเลิก</button>
            <button class="btn btn-primary" type="submit"><span class="material-symbols-outlined text-base">save</span>${movie.id ? 'บันทึกการแก้ไข' : 'เพิ่มภาพยนตร์'}</button>
        </div>
    </form>`;
}

function bindImagePreview(input, preview, emptyText) {
    const update = () => {
        const url = input.value.trim();
        if (/^https:\/\/\S+$/i.test(url)) {
            preview.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
            preview.textContent = '';
        } else {
            preview.style.backgroundImage = '';
            preview.textContent = url ? 'ลิงก์ต้องขึ้นต้นด้วย https://' : emptyText;
        }
    };
    input.addEventListener('input', update);
    update();
}

function showFieldError(input, message) {
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    let holder = input.parentElement;
    if (holder.classList.contains('flex')) holder = holder.parentElement; // e.g. duration + "นาที"
    let error = holder.querySelector('.field-error');
    if (!error) {
        error = document.createElement('p');
        error.className = 'field-error';
        holder.appendChild(error);
    }
    error.textContent = message;
}

function clearFieldErrors(form) {
    form.querySelectorAll('.invalid').forEach((el) => { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
    form.querySelectorAll('.field-error').forEach((el) => el.remove());
}

function openMovieForm(movie = null) {
    openModal(movie ? `แก้ไข: ${movieTitle(movie)}` : 'เพิ่มภาพยนตร์', movieForm(movie || {}));
    const form = $('#movie-form');
    form.querySelector('[data-close-modal]').addEventListener('click', closeModal);

    // segmented buttons (rating, status)
    form.querySelectorAll('.segmented').forEach((group) => {
        group.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (!button) return;
            group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        });
    });

    // genre chips
    const genreBox = $('#mf-genres');
    genreBox.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-genre]');
        if (chip) chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
    });
    const addGenre = () => {
        const value = $('#mf-genre-new').value.trim();
        if (!value) return;
        const existing = [...genreBox.querySelectorAll('[data-genre]')].find((c) => c.dataset.genre === value);
        if (existing) existing.setAttribute('aria-pressed', 'true');
        else genreBox.insertAdjacentHTML('beforeend', `<button type="button" class="chip" data-genre="${esc(value)}" aria-pressed="true">${esc(value)}</button>`);
        $('#mf-genre-new').value = '';
    };
    $('#mf-genre-add').addEventListener('click', addGenre);
    $('#mf-genre-new').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addGenre();
        }
    });

    // live helpers
    $('#mf-duration').addEventListener('input', () => { $('#mf-duration-text').textContent = durationText($('#mf-duration').value); });
    $('#mf-description').addEventListener('input', () => { $('#mf-description-count').textContent = $('#mf-description').value.length; });
    bindImagePreview($('#mf-poster'), $('#mf-poster-preview'), 'ยังไม่มีโปสเตอร์');
    bindImagePreview($('#mf-backdrop'), $('#mf-backdrop-preview'), 'ยังไม่มีภาพพื้นหลัง');

    // cast rows
    const castBox = $('#mf-cast');
    $('#mf-cast-add').addEventListener('click', () => {
        castBox.insertAdjacentHTML('beforeend', castRowHtml());
        castBox.lastElementChild.querySelector('input').focus();
    });
    castBox.addEventListener('click', (event) => {
        if (event.target.closest('[data-remove-cast]')) event.target.closest('.cast-row').remove();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFieldErrors(form);
        const titleInput = $('#mf-titleThai');
        const durationInput = $('#mf-duration');
        const duration = Number(durationInput.value);
        let firstInvalid = null;
        if (!titleInput.value.trim()) {
            showFieldError(titleInput, 'กรุณากรอกชื่อภาษาไทย');
            firstInvalid = firstInvalid || titleInput;
        }
        if (!Number.isFinite(duration) || duration < 30 || duration > 400) {
            showFieldError(durationInput, 'กรอกความยาวเป็นนาที ระหว่าง 30-400');
            firstInvalid = firstInvalid || durationInput;
        }
        for (const id of ['#mf-poster', '#mf-backdrop', '#mf-trailer']) {
            const input = $(id);
            if (input.value.trim() && !/^https:\/\//i.test(input.value.trim())) {
                showFieldError(input, 'ลิงก์ต้องขึ้นต้นด้วย https://');
                firstInvalid = firstInvalid || input;
            }
        }
        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        const data = Object.fromEntries(new FormData(form).entries());
        const body = {
            ...data,
            durationMinutes: duration,
            releaseDate: inputToRelease($('#mf-release').value),
            ageLimit: $('#mf-age [aria-pressed="true"]')?.dataset.value || '',
            status: $('#mf-status [aria-pressed="true"]')?.dataset.value || 'now_showing',
            genres: [...genreBox.querySelectorAll('[data-genre][aria-pressed="true"]')].map((c) => c.dataset.genre),
            cast: [...castBox.querySelectorAll('.cast-row')]
                .map((row) => ({
                    name: row.querySelector('[data-cast="name"]').value.trim(),
                    role: row.querySelector('[data-cast="role"]').value.trim(),
                    image: row.querySelector('[data-cast="image"]').value.trim()
                }))
                .filter((actor) => actor.name)
        };
        const saved = await withButton(form.querySelector('[type=submit]'), () => (movie
            ? api.request(`/api/admin/movies/${encodeURIComponent(movie.id)}`, { method: 'PUT', body })
            : api.request('/api/admin/movies', { method: 'POST', body })));
        if (!saved) return;
        closeModal();
        toast(movie ? 'บันทึกการแก้ไขแล้ว' : `เพิ่ม "${saved.titleThai}" แล้ว — สร้างรอบฉายได้ที่เมนูรอบฉาย`);
        loadMovies();
    });
}

$('#movie-add-btn').addEventListener('click', () => openMovieForm());
$('#movie-search').addEventListener('input', renderMoviesTable);
$('#movies-table').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-movie]')?.dataset.editMovie;
    const deleteId = event.target.closest('[data-delete-movie]')?.dataset.deleteMovie;
    if (editId) openMovieForm(moviesCache.find((movie) => movie.id === editId));
    if (deleteId) {
        const movie = moviesCache.find((item) => item.id === deleteId);
        if (!window.confirm(`ลบ "${movieTitle(movie)}" ?\nรอบฉายที่ยังไม่มีการจองจะถูกลบไปด้วย`)) return;
        const result = await withButton(event.target, () => api.request(`/api/admin/movies/${encodeURIComponent(deleteId)}`, { method: 'DELETE' }));
        if (!result) return;
        toast(result.message || 'ลบภาพยนตร์แล้ว');
        loadMovies();
    }
});

// ---------------------------------------------------------------------------
// showtimes
// ---------------------------------------------------------------------------
const FORMAT_OPTIONS = ['Digital 2D', 'IMAX', 'IMAX 3D', '4DX', 'VIP Class'];
const TYPE_OPTIONS = ['Thai Audio', 'Thai Audio / Eng Sub', 'EN Audio / TH Sub', 'Thai Dub / EN SUB'];
const TIME_SUGGESTIONS = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30', '22:00'];
const CLEANUP_MINUTES = 15;
const stForm = { cinema: '', hall: '', format: 'Digital 2D', type: 'Thai Audio / Eng Sub', times: new Set(), extraHalls: {}, existing: [] };

const toMinutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const toTime = (minutes) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
function selectedMovie() { return moviesCache.find((m) => m.id === $('#st-movie').value); }
function movieDuration() { return Number(selectedMovie()?.durationMinutes) || 120; }
function daysBetween(from, to) {
    if (!from || !to || to < from) return 0;
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

function fillMovieSelects() {
    const options = moviesCache
        .filter((movie) => movie.status !== 'archived')
        .map((movie) => `<option value="${esc(movie.id)}">${esc(movieTitle(movie))}</option>`)
        .join('');
    const current = $('#st-movie').value;
    $('#st-movie').innerHTML = options;
    if (current) $('#st-movie').value = current;
    const filterCurrent = $('#st-filter-movie').value;
    $('#st-filter-movie').innerHTML = `<option value="">ทุกเรื่อง</option>${moviesCache.map((movie) => `<option value="${esc(movie.id)}">${esc(movieTitle(movie))}</option>`).join('')}`;
    $('#st-filter-movie').value = filterCurrent;
    renderMovieInfo();
}

function renderMovieInfo() {
    const movie = selectedMovie();
    $('#st-movie-info').textContent = movie
        ? `ความยาว ${movie.durationMinutes || '?'} นาที • ใช้โรงรอบละ ~${durationText(movieDuration() + CLEANUP_MINUTES).replace('= ', '')} (รวมทำความสะอาด ${CLEANUP_MINUTES} นาที)`
        : 'ยังไม่มีภาพยนตร์ เพิ่มได้ที่เมนูภาพยนตร์';
    renderTimes();
}

function fillCinemaOptions() {
    $('#cinema-options').innerHTML = cinemasCache.map((cinema) => `<option value="${esc(cinema.name)}"></option>`).join('');
    const names = cinemasCache.map((c) => c.name);
    if (!stForm.cinema || (!names.includes(stForm.cinema) && $('#st-cinema-select').value !== '__new')) stForm.cinema = names[0] || '';
    $('#st-cinema-select').innerHTML = `${names.map((name) => `<option value="${esc(name)}" ${name === stForm.cinema ? 'selected' : ''}>${esc(name)}</option>`).join('')}
        <option value="__new">+ เพิ่มสาขาใหม่</option>`;
    if (!names.length) $('#st-cinema-select').value = '__new';
    $('#st-cinema-new').classList.toggle('hidden', $('#st-cinema-select').value !== '__new');
    renderHallChips();
}

function currentCinemaName() {
    return $('#st-cinema-select').value === '__new' ? $('#st-cinema-new').value.trim() : $('#st-cinema-select').value;
}

function renderHallChips() {
    const name = currentCinemaName();
    const cinema = cinemasCache.find((c) => c.name === name);
    const halls = [...new Set([...(cinema?.halls || []), ...(stForm.extraHalls[name] || [])])]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!halls.includes(stForm.hall)) stForm.hall = halls.length === 1 ? halls[0] : '';
    $('#st-hall-chips').innerHTML = halls.length
        ? halls.map((hall) => `<button class="chip" data-hall="${esc(hall)}" aria-pressed="${hall === stForm.hall}" type="button">${esc(hall)}</button>`).join('')
        : '<span class="hint">ยังไม่มีโรงย่อย เพิ่มด้านล่าง</span>';
    renderSummary();
}

function renderFormatAndType() {
    $('#st-format').innerHTML = FORMAT_OPTIONS.map((f) => `<button data-value="${esc(f)}" aria-pressed="${f === stForm.format}" type="button">${esc(f)}</button>`).join('');
    $('#st-type').innerHTML = TYPE_OPTIONS.map((t) => `<button class="chip" data-value="${esc(t)}" aria-pressed="${t === stForm.type && !$('#st-type-other').value.trim()}" type="button">${esc(t)}</button>`).join('');
}

/** Same rules as the server: skip past times and anything overlapping a show already in that hall. */
function planShowtimes() {
    const from = $('#st-from').value;
    const to = $('#st-to').value;
    const days = daysBetween(from, to);
    const duration = movieDuration();
    const nowMs = Date.now();
    const plan = { create: 0, past: 0, clash: 0, byTime: {} };
    for (let i = 0; i < days; i += 1) {
        const date = addDays(from, i);
        const taken = stForm.existing.filter((st) => st.date === date).map((st) => ({ start: toMinutes(st.startTime), end: toMinutes(st.endTime) + CLEANUP_MINUTES, label: `${st.startTime}–${st.endTime} ${st.movieTitle}` }));
        for (const time of [...stForm.times].sort()) {
            const start = toMinutes(time);
            const info = plan.byTime[time] || (plan.byTime[time] = { past: 0, clash: 0, with: '' });
            if (Date.parse(`${date}T${time}:00+07:00`) <= nowMs) {
                plan.past += 1;
                info.past += 1;
                continue;
            }
            const hit = taken.find((t) => start < t.end && t.start < start + duration + CLEANUP_MINUTES);
            if (hit) {
                plan.clash += 1;
                info.clash += 1;
                info.with = info.with || hit.label;
                continue;
            }
            taken.push({ start, end: start + duration + CLEANUP_MINUTES, label: `${time} (รอบใหม่)` });
            plan.create += 1;
        }
    }
    return plan;
}

let existingRequest = 0;
async function loadHallSchedule() {
    const cinema = currentCinemaName();
    const from = $('#st-from').value;
    const to = $('#st-to').value;
    const box = $('#st-existing');
    if (!cinema || !stForm.hall || !daysBetween(from, to)) {
        stForm.existing = [];
        box.classList.add('hidden');
        renderTimes();
        return;
    }
    const request = ++existingRequest;
    try {
        const rows = await api.request(`/api/admin/showtimes?${new URLSearchParams({ from, to })}`);
        if (request !== existingRequest) return;
        stForm.existing = rows.filter((st) => st.cinema === cinema && st.hall === stForm.hall && st.status === 'active');
    } catch (_error) {
        stForm.existing = [];
    }
    const unique = new Map();
    stForm.existing.forEach((st) => {
        const key = `${st.startTime}|${st.endTime}|${st.movieTitle}`;
        unique.set(key, (unique.get(key) || 0) + 1);
    });
    box.classList.remove('hidden');
    box.innerHTML = unique.size
        ? `<p class="font-bold mb-1">${esc(cinema)} ${esc(stForm.hall)} มีรอบอยู่แล้วในช่วงนี้</p>
           <div class="flex flex-wrap gap-1.5">${[...unique.entries()].sort().map(([key, n]) => {
               const [start, end, title] = key.split('|');
               return `<span class="inline-block rounded-md bg-white border border-slate-200 px-2 py-1 text-xs"><b>${esc(start)}–${esc(end)}</b> ${esc(title)}${n > 1 ? ` <span class="text-slate-400">(${n} วัน)</span>` : ''}</span>`;
           }).join('')}</div>`
        : `<p class="text-emerald-700 font-semibold">${esc(cinema)} ${esc(stForm.hall)} ยังว่างทั้งช่วงวันที่นี้</p>`;
    renderTimes();
}

function timeClashes() {
    const duration = movieDuration() + CLEANUP_MINUTES;
    const times = [...stForm.times].sort();
    const clashes = {};
    times.forEach((a, i) => times.slice(i + 1).forEach((b) => {
        if (toMinutes(b) < toMinutes(a) + duration) {
            clashes[a] = b;
            clashes[b] = a;
        }
    }));
    return clashes;
}

function renderTimes() {
    if (!$('#st-time-suggest')) return;
    const clashes = timeClashes();
    const duration = movieDuration();
    const times = [...stForm.times].sort();
    const plan = planShowtimes();
    const days = daysBetween($('#st-from').value, $('#st-to').value);
    const problem = (t) => {
        const info = plan.byTime[t];
        if (!info) return '';
        if (info.clash && info.clash + info.past >= days) return `ชนกับ ${info.with}`;
        if (info.clash) return `ชนกับ ${info.with} (${info.clash} วัน)`;
        if (info.past >= days) return 'เวลานี้ผ่านไปแล้ว';
        if (clashes[t]) return `ชนกับรอบ ${clashes[t]} ที่เลือก`;
        return '';
    };
    $('#st-time-suggest').innerHTML = TIME_SUGGESTIONS.map((t) => `<button class="chip" data-time="${t}" aria-pressed="${stForm.times.has(t)}" type="button">${t}</button>`).join('');
    $('#st-time-selected').innerHTML = times.length
        ? `<span class="label w-full !mb-0">เวลาที่เลือก (เริ่ม–จบ)</span>${times.map((t) => {
            const issue = problem(t);
            return `<span class="chip ${issue ? 'warn' : ''}" title="${esc(issue)}">
                ${t}–${toTime(toMinutes(t) + duration)}${issue ? ` <span class="font-normal">⚠ ${esc(issue)}</span>` : ''}
                <button class="x" data-remove-time="${t}" type="button" aria-label="ลบเวลา ${t}">×</button>
            </span>`;
        }).join('')}`
        : '';
    renderSummary();
}

function renderSummary() {
    if (!$('#st-summary')) return;
    const days = daysBetween($('#st-from').value, $('#st-to').value);
    const plan = planShowtimes();
    const missing = [];
    if (!selectedMovie()) missing.push('ภาพยนตร์');
    if (!currentCinemaName()) missing.push('สาขา');
    if (!stForm.hall) missing.push('โรงย่อย');
    if (!days) missing.push('วันที่');
    if (!stForm.times.size) missing.push('เวลา');
    const skipped = [plan.clash ? `${plan.clash} รอบชนกับรอบอื่น` : '', plan.past ? `${plan.past} รอบเวลาผ่านไปแล้ว` : ''].filter(Boolean);
    $('#st-summary').textContent = missing.length
        ? `ยังขาด: ${missing.join(', ')}`
        : `จะสร้าง ${plan.create} รอบ${skipped.length ? ` (ข้าม ${skipped.join(', ')})` : ` (${days} วัน × ${stForm.times.size} เวลา)`}`;
    $('#st-summary-detail').textContent = missing.length
        ? ''
        : `${movieTitle(selectedMovie())} • ${currentCinemaName()} ${stForm.hall} • ${stForm.format} • ${stForm.type}`;
    $('#showtime-form [type=submit]').disabled = missing.length > 0 || plan.create === 0;
}

function setDateRange(days, offset = 0) {
    const from = addDays(todayBangkok(), offset);
    $('#st-from').value = from;
    $('#st-to').value = addDays(from, days - 1);
    renderSummary();
}

async function loadShowtimesPanel() {
    const today = todayBangkok();
    for (const [id, value] of [['#st-from', today], ['#st-to', today], ['#st-filter-from', today], ['#st-filter-to', addDays(today, 6)]]) {
        if (!$(id).value) $(id).value = value;
    }
    $('#st-from').min = today;
    $('#st-to').min = today;
    try {
        [moviesCache, cinemasCache] = await Promise.all([api.request('/api/admin/movies'), api.request('/api/admin/cinemas')]);
        renderFormatAndType();
        fillMovieSelects();
        fillCinemaOptions();
        loadHallSchedule();
    } catch (error) {
        toast(error.message, 'error');
    }
    loadShowtimes();
}

let showtimesCache = [];
async function loadShowtimes() {
    loading($('#showtimes-table'));
    const params = new URLSearchParams({ from: $('#st-filter-from').value, to: $('#st-filter-to').value });
    if ($('#st-filter-movie').value) params.set('movieId', $('#st-filter-movie').value);
    try {
        showtimesCache = await api.request(`/api/admin/showtimes?${params}`);
    } catch (error) {
        toast(error.message, 'error');
        return;
    }
    $('#showtimes-table').innerHTML = `<table class="table">
        <thead><tr><th>วันที่</th><th>เวลา</th><th>ภาพยนตร์</th><th>โรง</th><th>ระบบ</th><th>ที่นั่ง</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${showtimesCache.length ? showtimesCache.map((st) => `
            <tr class="${st.status !== 'active' ? 'bg-slate-50 text-slate-400' : ''}">
                <td class="whitespace-nowrap">${esc(dateTh(st.date))}</td>
                <td class="whitespace-nowrap font-semibold tabular-nums">${esc(st.startTime)}-${esc(st.endTime)}</td>
                <td>${esc(st.movieTitle)}</td>
                <td>${esc(st.cinema)}<br><span class="text-xs text-slate-500">${esc(st.hall)}</span></td>
                <td>${esc(st.format)}<br><span class="text-xs text-slate-500">${esc(st.type || '')}</span></td>
                <td>${occupancyBar(st.bookedSeats, st.heldSeats, st.capacity)}</td>
                <td>${st.status === 'active' ? badge('เปิดจอง', 'bg-emerald-100 text-emerald-800') : badge(st.status === 'legacy' ? 'ข้อมูลเก่า' : 'ปิดรอบ', 'bg-slate-200 text-slate-600')}</td>
                <td class="whitespace-nowrap text-right">
                    <button class="btn btn-ghost btn-sm" data-seats="${esc(st.id)}" type="button">ผังที่นั่ง</button>
                    <button class="btn btn-ghost btn-sm" data-edit-st="${esc(st.id)}" type="button">แก้ไข</button>
                    <button class="btn btn-danger btn-sm" data-delete-st="${esc(st.id)}" type="button">ลบ</button>
                </td>
            </tr>`).join('') : emptyRow('ไม่มีรอบฉายในช่วงวันที่นี้', 8)}</tbody></table>`;
}

$('#st-filter-btn').addEventListener('click', loadShowtimes);
$('#st-movie').addEventListener('change', renderMovieInfo);
$('#st-cinema-select').addEventListener('change', () => {
    const isNew = $('#st-cinema-select').value === '__new';
    $('#st-cinema-new').classList.toggle('hidden', !isNew);
    if (isNew) $('#st-cinema-new').focus();
    else stForm.cinema = $('#st-cinema-select').value;
    stForm.hall = '';
    renderHallChips();
    loadHallSchedule();
});
$('#st-cinema-new').addEventListener('input', renderHallChips);
$('#st-hall-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-hall]');
    if (!chip) return;
    stForm.hall = chip.dataset.hall;
    renderHallChips();
    loadHallSchedule();
});
const addHall = () => {
    const hall = $('#st-hall-new').value.trim();
    const cinema = currentCinemaName();
    if (!hall) return;
    if (!cinema) {
        toast('กรุณาใส่ชื่อสาขาก่อน', 'error');
        return;
    }
    stForm.extraHalls[cinema] = [...new Set([...(stForm.extraHalls[cinema] || []), hall])];
    stForm.hall = hall;
    $('#st-hall-new').value = '';
    renderHallChips();
    loadHallSchedule();
};
$('#st-hall-add').addEventListener('click', addHall);
$('#st-hall-new').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addHall(); } });
$('#st-format').addEventListener('click', (event) => {
    const button = event.target.closest('[data-value]');
    if (!button) return;
    stForm.format = button.dataset.value;
    renderFormatAndType();
    renderSummary();
});
$('#st-type').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-value]');
    if (!chip) return;
    stForm.type = chip.dataset.value;
    $('#st-type-other').value = '';
    renderFormatAndType();
});
$('#st-type-other').addEventListener('input', () => {
    stForm.type = $('#st-type-other').value.trim() || TYPE_OPTIONS[1];
    renderFormatAndType();
});
$('#st-range-quick').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-days]');
    if (chip) {
        setDateRange(Number(chip.dataset.days), Number(chip.dataset.offset || 0));
        loadHallSchedule();
    }
});
['#st-from', '#st-to'].forEach((id) => $(id).addEventListener('change', () => {
    if ($('#st-to').value < $('#st-from').value) $('#st-to').value = $('#st-from').value;
    loadHallSchedule();
}));
$('#st-time-suggest').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-time]');
    if (!chip) return;
    const t = chip.dataset.time;
    if (stForm.times.has(t)) stForm.times.delete(t); else stForm.times.add(t);
    renderTimes();
});
const addTime = () => {
    const t = $('#st-time-new').value;
    if (!/^\d{2}:\d{2}$/.test(t)) return;
    stForm.times.add(t);
    $('#st-time-new').value = '';
    renderTimes();
};
$('#st-time-add').addEventListener('click', addTime);
$('#st-time-new').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addTime(); } });
$('#st-time-selected').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-time]');
    if (!button) return;
    stForm.times.delete(button.dataset.removeTime);
    renderTimes();
});

$('#showtime-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {
        movieId: $('#st-movie').value,
        cinema: currentCinemaName(),
        hall: stForm.hall,
        format: stForm.format,
        type: stForm.type,
        dateFrom: $('#st-from').value,
        dateTo: $('#st-to').value,
        times: [...stForm.times].sort()
    };
    const result = await withButton(event.submitter, () => api.request('/api/admin/showtimes', { method: 'POST', body }));
    if (!result) return;
    const reasonText = (reason) => reason.replace(/\(([^)]+)\)$/, (_m, id) => `(${movieTitle(moviesCache.find((m) => m.id === id)) || id})`);
    const skipped = result.skipped.length
        ? `<details class="mt-2 text-amber-900"><summary class="cursor-pointer text-sm">ดูรอบที่ข้าม</summary>
            <ul class="mt-2 list-disc pl-5">${result.skipped.map((x) => `<li>${esc(dateTh(x.date))} ${esc(x.startTime)} — ${esc(reasonText(x.reason))}</li>`).join('')}</ul></details>`
        : '';
    $('#showtime-result').innerHTML = `<div class="rounded-xl border p-4 ${result.created.length ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}">
        <p class="font-bold ${result.created.length ? 'text-emerald-800' : 'text-amber-800'}">สร้างรอบฉายแล้ว ${result.created.length} รอบ${result.skipped.length ? ` • ข้าม ${result.skipped.length} รอบ` : ''}</p>${skipped}</div>`;
    toast(`สร้างรอบฉายแล้ว ${result.created.length} รอบ`);
    try {
        cinemasCache = await api.request('/api/admin/cinemas');
        stForm.cinema = body.cinema;
        fillCinemaOptions();
    } catch (_error) {
    }
    loadShowtimes();
    loadHallSchedule();
});

async function openSeatMap(showtimeId) {
    openModal('ผังที่นั่ง', '<p class="text-sm text-slate-500">กำลังโหลด...</p>');
    let data;
    try {
        data = await api.request(`/api/admin/showtimes/${encodeURIComponent(showtimeId)}/seats`);
    } catch (error) {
        closeModal();
        toast(error.message, 'error');
        return;
    }
    const st = data.showtime;
    const seatsByRow = {};
    data.seats.forEach((seat) => { (seatsByRow[seat.code[0]] = seatsByRow[seat.code[0]] || []).push(seat); });
    const legend = [['seat-free', 'ว่าง'], ['seat-held', 'รอชำระ'], ['seat-booked', 'จองแล้ว'], ['seat-used', 'เข้าชมแล้ว']]
        .map(([cls, text]) => `<span class="flex items-center gap-1"><span class="seat ${cls} !w-4 !h-4"></span>${text}</span>`).join('');
    $('#modal-title').textContent = `${data.movieTitle} — ${dateTh(st.date)} ${st.startTime}`;
    $('#modal-body').innerHTML = `
        <p class="text-sm text-slate-500 mb-4">${esc(st.cinema)} • ${esc(st.hall)} • ${esc(st.format)}</p>
        <div class="text-center text-xs font-bold text-slate-400 tracking-widest mb-3">— จอ —</div>
        <div class="space-y-2 mb-4">${Object.entries(seatsByRow).map(([row, seats]) => `
            <div class="flex items-center justify-center gap-2">
                <span class="w-5 text-xs font-bold text-slate-400">${row}</span>
                ${seats.map((seat) => `<div class="seat seat-${seat.state}" title="${esc(`${seat.code} (${seat.type})${seat.bookingId ? ` • ${seat.bookingId}` : ''}${seat.userEmail ? ` • ${seat.userEmail}` : ''}`)}">${seat.code}</div>`).join('')}
            </div>`).join('')}</div>
        <div class="flex flex-wrap justify-center gap-4 text-xs text-slate-600 mb-6">${legend}</div>
        <h4 class="font-bold mb-2">การจองในรอบนี้</h4>
        <div class="overflow-x-auto"><table class="table">
            <thead><tr><th>Booking ID</th><th>ลูกค้า</th><th>ที่นั่ง</th><th class="num">ยอด</th><th>สถานะ</th></tr></thead>
            <tbody>${data.bookings.length ? data.bookings.map((b) => `<tr>
                <td class="font-mono text-xs">${esc(b.bookingId)}</td><td>${esc(b.userEmail || '-')}</td>
                <td>${esc(b.seats.join(', '))}</td><td class="num">${money(b.pricing?.total)}</td><td>${api.statusBadge(b.status)}</td>
            </tr>`).join('') : emptyRow('ยังไม่มีการจอง', 5)}</tbody>
        </table></div>`;
}

function openShowtimeEdit(st) {
    const locked = (st.bookedSeats || 0) + (st.heldSeats || 0) > 0;
    const movie = moviesCache.find((m) => m.id === st.movieId);
    const duration = Number(movie?.durationMinutes) || (toMinutes(st.endTime) - toMinutes(st.startTime)) || 120;
    const formats = FORMAT_OPTIONS.includes(st.format) ? FORMAT_OPTIONS : [...FORMAT_OPTIONS, st.format];
    openModal('แก้ไขรอบฉาย', `<form id="st-edit-form" class="space-y-4" novalidate>
        <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
            <p class="font-bold">${esc(st.movieTitle)}</p>
            <p class="text-slate-500">${esc(dateTh(st.date))} • ${esc(st.startTime)}–${esc(st.endTime)} • ${esc(st.cinema)} ${esc(st.hall)}</p>
        </div>
        ${locked ? `<p class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            <b>รอบนี้มีการจองแล้ว ${(st.bookedSeats || 0) + (st.heldSeats || 0)} ที่นั่ง</b> จึงย้ายวัน เวลา หรือโรงไม่ได้ (แก้ได้เฉพาะระบบฉายและเสียง) ถ้าต้องการปิดรอบ ให้ยกเลิกการจองในเมนู "การจอง / เช็คอิน" ก่อน</p>` : ''}
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">schedule</span>วันและเวลา</h4>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="label" for="se-date">วันที่</label><input class="field" id="se-date" name="date" type="date" value="${esc(st.date)}" ${locked ? 'disabled' : ''}></div>
                <div><label class="label" for="se-time">เวลาเริ่ม</label><input class="field" id="se-time" name="startTime" type="time" value="${esc(st.startTime)}" ${locked ? 'disabled' : ''}>
                    <p class="hint">จบประมาณ <b id="se-end">${esc(st.endTime)}</b> (หนังยาว ${duration} นาที)</p></div>
            </div>
        </section>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">location_on</span>โรงภาพยนตร์</h4>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="label" for="se-cinema">สาขา</label><input class="field" id="se-cinema" name="cinema" list="cinema-options" value="${esc(st.cinema)}" ${locked ? 'disabled' : ''}></div>
                <div><label class="label" for="se-hall">โรงย่อย</label><input class="field" id="se-hall" name="hall" value="${esc(st.hall)}" ${locked ? 'disabled' : ''}></div>
            </div>
        </section>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">theaters</span>ระบบฉายและเสียง</h4>
            <div class="segmented" id="se-format" role="group" aria-label="ระบบฉาย">
                ${formats.map((f) => `<button type="button" data-value="${esc(f)}" aria-pressed="${f === st.format}">${esc(f)}</button>`).join('')}
            </div>
            <label class="label mt-3" for="se-type">เสียง / ซับไตเติล</label>
            <input class="field" id="se-type" name="type" list="type-options" value="${esc(st.type || '')}">
            <datalist id="type-options">${TYPE_OPTIONS.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        </section>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">toggle_on</span>การขายตั๋ว</h4>
            <div class="flex items-center gap-3">
                <button class="switch" id="se-status" role="switch" type="button" aria-checked="${st.status === 'active'}" ${locked && st.status === 'active' ? 'disabled' : ''} aria-label="เปิดขายตั๋วรอบนี้"></button>
                <span class="text-sm" id="se-status-text">${st.status === 'active' ? 'เปิดขายตั๋ว' : 'ปิดรอบ (ลูกค้าไม่เห็นรอบนี้)'}</span>
            </div>
        </section>
        <div class="modal-actions">
            <button class="btn btn-ghost" type="button" data-close-modal>ยกเลิก</button>
            <button class="btn btn-primary" type="submit"><span class="material-symbols-outlined text-base">save</span>บันทึก</button>
        </div>
    </form>`);
    const form = $('#st-edit-form');
    form.querySelector('[data-close-modal]').addEventListener('click', closeModal);
    $('#se-time').addEventListener('input', () => {
        if ($('#se-time').value) $('#se-end').textContent = toTime(toMinutes($('#se-time').value) + duration);
    });
    $('#se-format').addEventListener('click', (event) => {
        const button = event.target.closest('[data-value]');
        if (button) $('#se-format').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    });
    $('#se-status').addEventListener('click', () => {
        const on = $('#se-status').getAttribute('aria-checked') !== 'true';
        $('#se-status').setAttribute('aria-checked', String(on));
        $('#se-status-text').textContent = on ? 'เปิดขายตั๋ว' : 'ปิดรอบ (ลูกค้าไม่เห็นรอบนี้)';
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = {
            format: $('#se-format [aria-pressed="true"]')?.dataset.value || st.format,
            type: $('#se-type').value.trim(),
            status: $('#se-status').getAttribute('aria-checked') === 'true' ? 'active' : 'cancelled'
        };
        if (!locked) Object.assign(body, { date: $('#se-date').value, startTime: $('#se-time').value, cinema: $('#se-cinema').value.trim(), hall: $('#se-hall').value.trim() });
        const saved = await withButton(event.submitter, () => api.request(`/api/admin/showtimes/${encodeURIComponent(st.id)}`, { method: 'PUT', body }));
        if (!saved) return;
        closeModal();
        toast('บันทึกรอบฉายแล้ว');
        loadShowtimes();
    });
}

$('#showtimes-table').addEventListener('click', async (event) => {
    const seatsId = event.target.closest('[data-seats]')?.dataset.seats;
    const editId = event.target.closest('[data-edit-st]')?.dataset.editSt;
    const deleteId = event.target.closest('[data-delete-st]')?.dataset.deleteSt;
    if (seatsId) openSeatMap(seatsId);
    if (editId) openShowtimeEdit(showtimesCache.find((st) => st.id === editId));
    if (deleteId) {
        const st = showtimesCache.find((item) => item.id === deleteId);
        if (!window.confirm(`ลบรอบ ${st.movieTitle} ${dateTh(st.date)} ${st.startTime} ?`)) return;
        const result = await withButton(event.target, () => api.request(`/api/admin/showtimes/${encodeURIComponent(deleteId)}`, { method: 'DELETE' }));
        if (!result) return;
        toast('ลบรอบฉายแล้ว');
        loadShowtimes();
    }
});

// ---------------------------------------------------------------------------
// bookings + check-in
// ---------------------------------------------------------------------------
let bookingsCache = [];

function bookingSummaryHtml(b) {
    return `<div class="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <p><span class="text-slate-500">Booking ID:</span> <b class="font-mono">${esc(b.bookingId)}</b></p>
        <p><span class="text-slate-500">สถานะ:</span> ${api.statusBadge(b.status)}</p>
        <p class="sm:col-span-2"><span class="text-slate-500">ภาพยนตร์:</span> <b>${esc(b.movie?.title)}</b></p>
        <p><span class="text-slate-500">รอบ:</span> ${esc(dateTh(b.showtime?.date))} ${esc(b.showtime?.startTime || '')}</p>
        <p><span class="text-slate-500">โรง:</span> ${esc(b.showtime?.cinema || b.movie?.cinema || '')} • ${esc(b.showtime?.hall || b.movie?.hall || '')}</p>
        <p><span class="text-slate-500">ที่นั่ง:</span> <b>${esc((b.seats || []).join(', '))}</b></p>
        <p><span class="text-slate-500">ลูกค้า:</span> ${esc(b.userEmail || '-')}</p>
        <p><span class="text-slate-500">ยอดชำระ:</span> ${money(b.pricing?.total)}${b.promotion?.code ? ` (โค้ด ${esc(b.promotion.code)})` : ''}</p>
        <p><span class="text-slate-500">ชำระผ่าน:</span> ${esc(b.payment?.method || '-')}${b.payment?.transactionId ? ` • ${esc(b.payment.transactionId)}` : ''}</p>
        <p><span class="text-slate-500">จองเมื่อ:</span> ${esc(dateTimeTh(b.createdAt))}</p>
        <p><span class="text-slate-500">ชำระเมื่อ:</span> ${esc(dateTimeTh(b.paidAt))}</p>
        ${b.checkedInAt ? `<p><span class="text-slate-500">เช็คอินเมื่อ:</span> ${esc(dateTimeTh(b.checkedInAt))}</p>` : ''}
        ${b.cancelledAt ? `<p class="sm:col-span-2"><span class="text-slate-500">ยกเลิกเมื่อ:</span> ${esc(dateTimeTh(b.cancelledAt))} — ${esc(b.cancelReason || '')}${b.payment?.status === 'refunded' ? ` (คืนเงิน ${money(b.payment.refundAmount)})` : ''}</p>` : ''}
    </div>`;
}

async function searchBookings() {
    loading($('#bookings-table'));
    const params = new URLSearchParams();
    if ($('#bk-q').value.trim()) params.set('q', $('#bk-q').value.trim());
    if ($('#bk-date').value) params.set('date', $('#bk-date').value);
    if ($('#bk-status').value) params.set('status', $('#bk-status').value);
    try {
        bookingsCache = await api.request(`/api/admin/bookings?${params}`);
    } catch (error) {
        toast(error.message, 'error');
        return;
    }
    $('#bookings-table').innerHTML = `<table class="table">
        <thead><tr><th>Booking ID</th><th>จองเมื่อ</th><th>ลูกค้า</th><th>ภาพยนตร์ / รอบ</th><th>ที่นั่ง</th><th class="num">ยอด</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${bookingsCache.length ? bookingsCache.map((b) => `<tr>
            <td class="font-mono text-xs whitespace-nowrap">${esc(b.bookingId)}</td>
            <td class="text-xs text-slate-500 whitespace-nowrap">${esc(dateTimeTh(b.createdAt))}</td>
            <td>${esc(b.userEmail || '-')}</td>
            <td>${esc(b.movie?.title || '-')}<br><span class="text-xs text-slate-500">${esc(dateTh(b.showtime?.date))} ${esc(b.showtime?.startTime || '')} • ${esc(b.showtime?.hall || b.movie?.hall || '')}</span></td>
            <td>${esc((b.seats || []).join(', '))}</td>
            <td class="num">${money(b.pricing?.total)}</td>
            <td>${api.statusBadge(b.status)}</td>
            <td class="whitespace-nowrap text-right">
                <button class="btn btn-ghost btn-sm" data-view-bk="${esc(b.bookingId)}" type="button">ดู</button>
                ${['paid', 'pending'].includes(b.status) ? `<button class="btn btn-danger btn-sm" data-cancel-bk="${esc(b.bookingId)}" type="button">${b.status === 'paid' ? 'ยกเลิก/คืนเงิน' : 'ยกเลิก'}</button>` : ''}
            </td>
        </tr>`).join('') : emptyRow('ไม่พบการจอง', 8)}</tbody></table>`;
}

$('#booking-search').addEventListener('submit', (event) => {
    event.preventDefault();
    searchBookings();
});

$('#bookings-table').addEventListener('click', async (event) => {
    const viewId = event.target.closest('[data-view-bk]')?.dataset.viewBk;
    const cancelId = event.target.closest('[data-cancel-bk]')?.dataset.cancelBk;
    if (viewId) {
        const booking = bookingsCache.find((b) => b.bookingId === viewId);
        openModal(`การจอง ${viewId}`, bookingSummaryHtml(booking));
    }
    if (cancelId) {
        const booking = bookingsCache.find((b) => b.bookingId === cancelId);
        const reason = window.prompt(
            `${booking.status === 'paid' ? `ยกเลิกและคืนเงิน ${money(booking.pricing?.total)}` : 'ยกเลิกการจองที่รอชำระ'} ${cancelId}\nที่นั่ง ${booking.seats.join(', ')} จะถูกปล่อยคืน\n\nเหตุผล:`,
            'ลูกค้าขอยกเลิก'
        );
        if (reason === null) return;
        const result = await withButton(event.target, () => api.request(`/api/admin/bookings/${encodeURIComponent(cancelId)}/cancel`, { method: 'POST', body: { reason } }));
        if (!result) return;
        toast(`ยกเลิก ${cancelId} แล้ว`);
        searchBookings();
    }
});

function showCheckInResult(kind, message, booking = null, canForce = false) {
    const styles = {
        ok: 'border-emerald-300 bg-emerald-50 text-emerald-900',
        error: 'border-rose-300 bg-rose-50 text-rose-900'
    };
    $('#checkin-result').innerHTML = `<div class="rounded-xl border-2 p-4 ${styles[kind]}">
        <p class="font-black text-lg flex items-center gap-2"><span class="material-symbols-outlined">${kind === 'ok' ? 'check_circle' : 'error'}</span>${esc(message)}</p>
        ${booking ? `<div class="mt-3 text-slate-800">${bookingSummaryHtml(booking)}</div>` : ''}
        ${canForce ? '<button class="btn btn-dark btn-sm mt-3" id="force-checkin" type="button">ยืนยันเช็คอินต่างวัน</button>' : ''}
    </div>`;
}

async function checkIn(code, force = false) {
    if (!code) return;
    try {
        const booking = await api.request('/api/admin/check-in', { method: 'POST', body: { code, force } });
        showCheckInResult('ok', `เช็คอินสำเร็จ — ที่นั่ง ${booking.seats.join(', ')}`, booking);
        $('#checkin-code').value = '';
        searchBookings();
    } catch (error) {
        showCheckInResult('error', error.message, error.data?.booking || null, Boolean(error.data?.canForce));
        $('#force-checkin')?.addEventListener('click', () => checkIn(code, true));
    }
    $('#checkin-code').focus();
}

$('#checkin-form').addEventListener('submit', (event) => {
    event.preventDefault();
    checkIn($('#checkin-code').value.trim());
});

let scanner = null;
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('โหลดตัวสแกน QR ไม่สำเร็จ'));
        document.head.appendChild(script);
    });
}

async function stopScanner() {
    if (!scanner) return;
    try { await scanner.stop(); } catch (_error) { /* already stopped */ }
    scanner = null;
    $('#qr-reader').classList.add('hidden');
    $('#scan-btn').innerHTML = '<span class="material-symbols-outlined text-base">photo_camera</span>สแกนด้วยกล้อง';
}

$('#scan-btn').addEventListener('click', async () => {
    if (scanner) {
        stopScanner();
        return;
    }
    try {
        if (!window.Html5Qrcode) await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
        $('#qr-reader').classList.remove('hidden');
        scanner = new window.Html5Qrcode('qr-reader');
        let lastCode = '';
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (decoded) => {
            if (decoded === lastCode) return; // ignore repeats of the same ticket
            lastCode = decoded;
            setTimeout(() => { lastCode = ''; }, 4000);
            checkIn(decoded);
        });
        $('#scan-btn').innerHTML = '<span class="material-symbols-outlined text-base">stop_circle</span>หยุดสแกน';
    } catch (error) {
        toast(error.message || 'เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้อง', 'error');
        stopScanner();
    }
});

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------
function initReportDates() {
    const today = todayBangkok();
    for (const [id, value] of [['#rs-from', addDays(today, -29)], ['#rs-to', today], ['#rm-from', addDays(today, -29)], ['#rm-to', today], ['#rt-date', today]]) {
        if (!$(id).value) $(id).value = value;
    }
}

const reportRunners = {
    async sales() {
        const params = new URLSearchParams({ from: $('#rs-from').value, to: $('#rs-to').value, groupBy: $('#rs-group').value });
        const data = await api.request(`/api/admin/reports/sales?${params}`);
        reportData.sales = data;
        const periodLabel = (period) => (data.groupBy === 'month'
            ? new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`))
            : dateTh(period));
        $('#rs-caption').textContent = `${dateTh(data.from)} – ${dateTh(data.to)} (${data.groupBy === 'month' ? 'รายเดือน' : 'รายวัน'}) • นับเฉพาะการจองที่ชำระเงินแล้วและไม่ถูกยกเลิก`;
        $('#rs-table').innerHTML = `<table class="table">
            <thead><tr><th>${data.groupBy === 'month' ? 'เดือน' : 'วันที่'}</th><th class="num">การจอง</th><th class="num">ตั๋ว (ใบ)</th><th class="num">ยอดก่อนส่วนลด</th><th class="num">ส่วนลด</th><th class="num">รายได้สุทธิ</th></tr></thead>
            <tbody>${data.rows.map((row) => `<tr class="${row.revenue ? '' : 'text-slate-400'}">
                <td>${esc(periodLabel(row.period))}</td><td class="num">${row.bookings}</td><td class="num">${row.tickets}</td>
                <td class="num">${money(row.gross)}</td><td class="num">${money(row.discount)}</td><td class="num font-semibold">${money(row.revenue)}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr class="font-black bg-slate-50"><td class="px-3 py-2">รวม</td><td class="num px-3">${data.totals.bookings}</td><td class="num px-3">${data.totals.tickets}</td>
                <td class="num px-3">${money(data.totals.gross)}</td><td class="num px-3">${money(data.totals.discount)}</td><td class="num px-3">${money(data.totals.revenue)}</td></tr></tfoot>
        </table>`;
    },
    async movies() {
        const params = new URLSearchParams({ from: $('#rm-from').value, to: $('#rm-to').value });
        const data = await api.request(`/api/admin/reports/movies?${params}`);
        reportData.movies = data;
        const totalTickets = data.rows.reduce((sum, row) => sum + row.tickets, 0) || 1;
        $('#rm-caption').textContent = `${dateTh(data.from)} – ${dateTh(data.to)} • ตามวันที่ชำระเงิน`;
        $('#rm-table').innerHTML = `<table class="table">
            <thead><tr><th>ภาพยนตร์</th><th class="num">การจอง</th><th class="num">ผู้ชม (ตั๋ว)</th><th>สัดส่วน</th><th class="num">เข้าชมแล้ว</th><th class="num">รายได้</th></tr></thead>
            <tbody>${data.rows.length ? data.rows.map((row) => `<tr>
                <td class="font-semibold">${esc(row.title)}</td><td class="num">${row.bookings}</td><td class="num">${row.tickets}</td>
                <td><div class="h-2 rounded-full bg-slate-100 min-w-[6rem]"><div class="h-2 rounded-full bg-primary" style="width:${Math.round((row.tickets / totalTickets) * 100)}%"></div></div></td>
                <td class="num">${row.checkedIn}</td><td class="num">${money(row.revenue)}</td>
            </tr>`).join('') : emptyRow('ไม่มีข้อมูลในช่วงวันที่นี้', 6)}</tbody></table>`;
    },
    async showtimes() {
        const data = await api.request(`/api/admin/reports/showtimes?date=${$('#rt-date').value}`);
        reportData.showtimes = data;
        $('#rt-caption').textContent = `รอบฉายวันที่ ${api.formatThaiDate(data.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
        $('#rt-table').innerHTML = `<table class="table">
            <thead><tr><th>เวลา</th><th>ภาพยนตร์</th><th>โรง</th><th class="num">จองแล้ว</th><th class="num">ว่าง</th><th class="num">% ที่นั่ง</th><th>ที่นั่งที่ถูกจอง</th><th class="num">รายได้</th></tr></thead>
            <tbody>${data.rows.length ? data.rows.map((row) => `<tr class="${row.status !== 'active' ? 'text-slate-400' : ''}">
                <td class="whitespace-nowrap font-semibold">${esc(row.startTime)}</td><td>${esc(row.movieTitle)}</td>
                <td>${esc(row.cinema)}<br><span class="text-xs text-slate-500">${esc(row.hall)}</span></td>
                <td class="num">${row.booked}/${row.capacity}</td><td class="num">${row.available}</td><td class="num">${row.occupancyPct}%</td>
                <td class="text-xs">${esc(row.seats.join(', ') || '-')}</td><td class="num">${money(row.revenue)}</td>
            </tr>`).join('') : emptyRow('ไม่มีรอบฉายในวันนี้', 8)}</tbody></table>`;
    }
};

const reportCsv = {
    sales: (d) => downloadCsv(`sales-${d.from}-${d.to}.csv`,
        [d.groupBy === 'month' ? 'เดือน' : 'วันที่', 'จำนวนการจอง', 'จำนวนตั๋ว', 'ยอดก่อนส่วนลด', 'ส่วนลด', 'รายได้สุทธิ'],
        [...d.rows.map((r) => [r.period, r.bookings, r.tickets, r.gross, r.discount, r.revenue]),
            ['รวม', d.totals.bookings, d.totals.tickets, d.totals.gross, d.totals.discount, d.totals.revenue]]),
    movies: (d) => downloadCsv(`movies-${d.from}-${d.to}.csv`,
        ['ภาพยนตร์', 'จำนวนการจอง', 'จำนวนผู้ชม (ตั๋ว)', 'เข้าชมแล้ว', 'รายได้'],
        d.rows.map((r) => [r.title, r.bookings, r.tickets, r.checkedIn, r.revenue])),
    showtimes: (d) => downloadCsv(`seats-${d.date}.csv`,
        ['เวลา', 'ภาพยนตร์', 'โรงภาพยนตร์', 'โรงย่อย', 'จองแล้ว', 'ความจุ', 'ว่าง', '% ที่นั่ง', 'ที่นั่งที่ถูกจอง', 'รายได้'],
        d.rows.map((r) => [r.startTime, r.movieTitle, r.cinema, r.hall, r.booked, r.capacity, r.available, r.occupancyPct, r.seats.join(' '), r.revenue]))
};

document.querySelectorAll('[data-report]').forEach((btn) => btn.addEventListener('click', () => withButton(btn, () => reportRunners[btn.dataset.report]())));
document.querySelectorAll('[data-csv]').forEach((btn) => btn.addEventListener('click', async () => {
    const key = btn.dataset.csv;
    if (!reportData[key]) await withButton(btn, () => reportRunners[key]());
    if (reportData[key]) reportCsv[key](reportData[key]);
}));
document.querySelectorAll('[data-print]').forEach((btn) => btn.addEventListener('click', async () => {
    const key = btn.dataset.print.replace('report-', '');
    if (!reportData[key]) await withButton(btn, () => reportRunners[key]());
    printOnly(btn.dataset.print);
}));

loaders.reports = () => {
    initReportDates();
    if (!reportData.sales) withButton(null, () => reportRunners.sales());
};

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------
const PRICING_FIELDS = [
    ['#pr-sofa', (p) => p.seatPrices['Sofa Pair']],
    ['#pr-premium', (p) => p.seatPrices.Premium],
    ['#pr-regular', (p) => p.seatPrices.Regular],
    ['#pr-fee', (p) => p.serviceFeePerSeat],
    ['#pr-hold', (p) => p.holdMinutes],
    ['#pr-bonus', (p) => p.loyalty.signupBonus],
    ['#pr-earn', (p) => p.loyalty.pointsEarnedPerBooking],
    ['#pr-req', (p) => p.loyalty.pointsRequired],
    ['#pr-disc', (p) => p.loyalty.pointDiscount]
];

async function loadPricing() {
    try {
        const pricing = await api.request('/api/admin/settings/pricing');
        PRICING_FIELDS.forEach(([id, get]) => { $(id).value = get(pricing); });
    } catch (error) {
        toast(error.message, 'error');
    }
}

$('#pricing-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const n = (id) => Number($(id).value);
    const body = {
        seatPrices: { 'Sofa Pair': n('#pr-sofa'), Premium: n('#pr-premium'), Regular: n('#pr-regular') },
        serviceFeePerSeat: n('#pr-fee'),
        holdMinutes: n('#pr-hold'),
        loyalty: { signupBonus: n('#pr-bonus'), pointsEarnedPerBooking: n('#pr-earn'), pointsRequired: n('#pr-req'), pointDiscount: n('#pr-disc') }
    };
    const saved = await withButton(event.submitter, () => api.request('/api/admin/settings/pricing', { method: 'PUT', body }));
    if (saved) toast('บันทึกราคาแล้ว');
});

// ---------------------------------------------------------------------------
// promotions
// ---------------------------------------------------------------------------
let promotionsCache = [];

function promoDiscountText(promo) {
    return promo.discountType === 'percent' ? `${promo.discountValue}%` : money(promo.discountValue);
}

async function loadPromotions() {
    loading($('#promotions-table'));
    try {
        promotionsCache = await api.request('/api/admin/promotions');
    } catch (error) {
        toast(error.message, 'error');
        return;
    }
    $('#promotions-table').innerHTML = `<table class="table">
        <thead><tr><th>โค้ด</th><th>รายละเอียด</th><th class="num">ส่วนลด</th><th>วันที่ใช้ได้</th><th>ช่วงเวลา</th><th class="num">ใช้ไปแล้ว</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${promotionsCache.length ? promotionsCache.map((p) => `<tr>
            <td class="font-mono font-bold">${esc(p.code)}</td>
            <td>${esc(p.description || '-')}</td>
            <td class="num">${promoDiscountText(p)}</td>
            <td>${p.daysOfWeek?.length ? esc(p.daysOfWeek.map((d) => DAY_NAMES[d]).join(' ')) : 'ทุกวัน'}</td>
            <td class="text-xs whitespace-nowrap">${p.startDate ? esc(dateTh(p.startDate)) : 'ไม่จำกัด'} – ${p.endDate ? esc(dateTh(p.endDate)) : 'ไม่จำกัด'}</td>
            <td class="num">${p.usedCount || 0}${p.totalLimit ? ` / ${p.totalLimit}` : ''}</td>
            <td>${p.active ? badge('ใช้งาน', 'bg-emerald-100 text-emerald-800') : badge('ปิด', 'bg-slate-200 text-slate-600')}</td>
            <td class="whitespace-nowrap text-right">
                <button class="btn btn-ghost btn-sm" data-edit-promo="${esc(p.code)}" type="button">แก้ไข</button>
                <button class="btn btn-danger btn-sm" data-delete-promo="${esc(p.code)}" type="button">ลบ</button>
            </td>
        </tr>`).join('') : emptyRow('ยังไม่มีโค้ดโปรโมชั่น', 8)}</tbody></table>`;
}

const DAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const DAY_PRESETS = [['ทุกวัน', []], ['จันทร์–ศุกร์', [1, 2, 3, 4, 5]], ['เสาร์–อาทิตย์', [0, 6]]];

function randomPromoCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return `CINE${Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}`;
}

function promoSummaryText(p) {
    const discount = p.discountType === 'percent' ? `ลด ${p.discountValue || '?'}%` : `ลด ${p.discountValue ? Number(p.discountValue).toLocaleString('th-TH') : '?'} บาท`;
    const days = p.daysOfWeek.length ? `ใช้ได้วัน${p.daysOfWeek.map((d) => DAY_FULL[d]).join(', ')}` : 'ใช้ได้ทุกวัน';
    const period = p.startDate || p.endDate
        ? `${p.startDate ? `ตั้งแต่ ${dateTh(p.startDate)}` : ''}${p.endDate ? ` ถึง ${dateTh(p.endDate)}` : ''}`.trim()
        : 'ไม่มีวันหมดอายุ';
    const limit = p.totalLimit ? `จำกัด ${p.totalLimit} สิทธิ์` : 'ไม่จำกัดจำนวนสิทธิ์';
    return `${discount} • ${days} • ${period} • ${limit} • 1 บัญชีใช้ได้ 1 ครั้ง${p.active ? '' : ' • (ปิดอยู่)'}`;
}

function openPromoForm(promo = null) {
    const p = promo || { discountType: 'amount', active: true, daysOfWeek: [], totalLimit: 0 };
    const days = new Set(p.daysOfWeek || []);
    openModal(promo ? `แก้ไขโค้ด ${promo.code}` : 'เพิ่มโค้ดโปรโมชั่น', `<form id="promo-form" class="space-y-4" novalidate>
        <div class="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
            <p class="text-xs font-bold text-primary mb-0.5">สรุปเงื่อนไขโค้ดนี้</p>
            <p class="font-semibold" id="pf-summary"></p>
        </div>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">sell</span>โค้ดและส่วนลด</h4>
            <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="label" for="pf-code">โค้ด <span class="text-rose-600">*</span></label>
                    <div class="flex gap-2">
                        <input class="field font-mono uppercase" id="pf-code" value="${esc(p.code || '')}" ${promo ? 'readonly' : ''} maxlength="20" placeholder="เช่น STUDENT50" autocomplete="off">
                        ${promo ? '' : '<button class="btn btn-ghost btn-sm" id="pf-random" type="button" title="สุ่มโค้ด"><span class="material-symbols-outlined text-base">casino</span>สุ่ม</button>'}
                    </div>
                    <p class="hint">${promo ? 'แก้ไขโค้ดไม่ได้หลังสร้างแล้ว' : 'ภาษาอังกฤษตัวใหญ่หรือตัวเลข 3–20 ตัว'}</p></div>
                <div><label class="label" for="pf-description">คำอธิบาย</label>
                    <input class="field" id="pf-description" value="${esc(p.description || '')}" placeholder="เช่น ส่วนลดนักศึกษา" maxlength="200"></div>
                <div><span class="label">ลดเป็น</span>
                    <div class="segmented" id="pf-type" role="group" aria-label="ประเภทส่วนลด">
                        <button type="button" data-value="amount" aria-pressed="${p.discountType !== 'percent'}">จำนวนเงิน (บาท)</button>
                        <button type="button" data-value="percent" aria-pressed="${p.discountType === 'percent'}">เปอร์เซ็นต์ (%)</button>
                    </div></div>
                <div><label class="label" for="pf-value">มูลค่าส่วนลด <span class="text-rose-600">*</span></label>
                    <div class="flex items-center gap-2">
                        <input class="field w-32" id="pf-value" type="number" inputmode="numeric" min="1" value="${esc(p.discountValue || '')}" placeholder="100">
                        <span class="text-sm text-slate-500" id="pf-unit">${p.discountType === 'percent' ? '%' : 'บาท'}</span>
                    </div></div>
            </div>
        </section>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">event</span>ใช้ได้เมื่อไร</h4>
            <span class="label">วันในสัปดาห์</span>
            <div class="flex flex-wrap gap-2" id="pf-presets">${DAY_PRESETS.map(([label]) => `<button class="chip" type="button" data-preset="${label}">${label}</button>`).join('')}</div>
            <div class="flex flex-wrap gap-2 mt-2" id="pf-days" role="group" aria-label="วันในสัปดาห์">
                ${DAY_NAMES.map((day, index) => `<button class="chip" type="button" data-day="${index}" aria-pressed="${days.has(index)}" title="${DAY_FULL[index]}">${day}</button>`).join('')}
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
                <div><label class="label" for="pf-start">เริ่มใช้ได้</label><input class="field" id="pf-start" type="date" value="${esc(p.startDate || '')}"><p class="hint">เว้นว่าง = ใช้ได้ทันที</p></div>
                <div><label class="label" for="pf-end">หมดอายุ</label><input class="field" id="pf-end" type="date" value="${esc(p.endDate || '')}"><p class="hint">เว้นว่าง = ไม่มีวันหมดอายุ</p></div>
            </div>
        </section>
        <section class="form-section">
            <h4><span class="material-symbols-outlined text-base text-primary">tune</span>จำนวนสิทธิ์และสถานะ</h4>
            <div class="grid sm:grid-cols-2 gap-4 items-start">
                <div><label class="label" for="pf-limit">จำนวนสิทธิ์ทั้งหมด</label>
                    <input class="field w-32" id="pf-limit" type="number" inputmode="numeric" min="0" value="${esc(p.totalLimit || '')}" placeholder="ไม่จำกัด">
                    <p class="hint">เว้นว่างหรือ 0 = ไม่จำกัด${promo ? ` • ใช้ไปแล้ว ${promo.usedCount || 0} ครั้ง` : ''}</p></div>
                <div><span class="label">สถานะ</span>
                    <div class="flex items-center gap-3">
                        <button class="switch" id="pf-active" role="switch" type="button" aria-checked="${p.active !== false}" aria-label="เปิดใช้โค้ดนี้"></button>
                        <span class="text-sm" id="pf-active-text"></span>
                    </div></div>
            </div>
        </section>
        <div class="modal-actions">
            <button class="btn btn-ghost" type="button" data-close-modal>ยกเลิก</button>
            <button class="btn btn-primary" type="submit"><span class="material-symbols-outlined text-base">save</span>${promo ? 'บันทึกการแก้ไข' : 'สร้างโค้ด'}</button>
        </div>
    </form>`);
    const form = $('#promo-form');
    form.querySelector('[data-close-modal]').addEventListener('click', closeModal);

    const read = () => ({
        code: $('#pf-code').value.trim().toUpperCase(),
        description: $('#pf-description').value.trim(),
        discountType: $('#pf-type [aria-pressed="true"]')?.dataset.value || 'amount',
        discountValue: Number($('#pf-value').value),
        startDate: $('#pf-start').value || null,
        endDate: $('#pf-end').value || null,
        totalLimit: Math.max(0, Number($('#pf-limit').value) || 0),
        active: $('#pf-active').getAttribute('aria-checked') === 'true',
        daysOfWeek: [...form.querySelectorAll('#pf-days [aria-pressed="true"]')].map((b) => Number(b.dataset.day)).sort()
    });
    const refresh = () => {
        const data = read();
        $('#pf-summary').textContent = promoSummaryText(data);
        $('#pf-unit').textContent = data.discountType === 'percent' ? '%' : 'บาท';
        $('#pf-active-text').textContent = data.active ? 'เปิดใช้งาน ลูกค้าใช้โค้ดได้' : 'ปิดอยู่ ลูกค้าใช้ไม่ได้';
        const selected = JSON.stringify(data.daysOfWeek);
        form.querySelectorAll('[data-preset]').forEach((chip) => {
            const preset = DAY_PRESETS.find(([label]) => label === chip.dataset.preset)[1];
            chip.setAttribute('aria-pressed', String(JSON.stringify(preset) === selected));
        });
    };

    $('#pf-code').addEventListener('input', () => {
        const pos = $('#pf-code').selectionStart;
        $('#pf-code').value = $('#pf-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        $('#pf-code').setSelectionRange(pos, pos);
    });
    $('#pf-random')?.addEventListener('click', () => { $('#pf-code').value = randomPromoCode(); });
    $('#pf-type').addEventListener('click', (event) => {
        const button = event.target.closest('[data-value]');
        if (!button) return;
        $('#pf-type').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        refresh();
    });
    $('#pf-days').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-day]');
        if (!chip) return;
        chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
        refresh();
    });
    $('#pf-presets').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-preset]');
        if (!chip) return;
        const preset = DAY_PRESETS.find(([label]) => label === chip.dataset.preset)[1];
        form.querySelectorAll('#pf-days [data-day]').forEach((b) => b.setAttribute('aria-pressed', String(preset.includes(Number(b.dataset.day)))));
        refresh();
    });
    $('#pf-active').addEventListener('click', () => {
        $('#pf-active').setAttribute('aria-checked', String($('#pf-active').getAttribute('aria-checked') !== 'true'));
        refresh();
    });
    form.addEventListener('input', refresh);
    refresh();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFieldErrors(form);
        const body = read();
        let firstInvalid = null;
        if (!/^[A-Z0-9]{3,20}$/.test(body.code)) {
            showFieldError($('#pf-code'), 'โค้ดต้องเป็น A-Z หรือ 0-9 ยาว 3–20 ตัว');
            firstInvalid = $('#pf-code');
        }
        if (!(body.discountValue > 0) || (body.discountType === 'percent' && body.discountValue > 100)) {
            showFieldError($('#pf-value'), body.discountType === 'percent' ? 'ใส่ 1–100%' : 'ใส่จำนวนเงินมากกว่า 0');
            firstInvalid = firstInvalid || $('#pf-value');
        }
        if (body.startDate && body.endDate && body.endDate < body.startDate) {
            showFieldError($('#pf-end'), 'วันหมดอายุต้องไม่ก่อนวันเริ่ม');
            firstInvalid = firstInvalid || $('#pf-end');
        }
        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }
        const saved = await withButton(form.querySelector('[type=submit]'), () => (promo
            ? api.request(`/api/admin/promotions/${encodeURIComponent(promo.code)}`, { method: 'PUT', body })
            : api.request('/api/admin/promotions', { method: 'POST', body })));
        if (!saved) return;
        closeModal();
        toast(promo ? 'บันทึกโค้ดแล้ว' : `สร้างโค้ด ${body.code} แล้ว`);
        loadPromotions();
    });
}

$('#promo-add-btn').addEventListener('click', () => openPromoForm());
$('#promotions-table').addEventListener('click', async (event) => {
    const editCode = event.target.closest('[data-edit-promo]')?.dataset.editPromo;
    const deleteCode = event.target.closest('[data-delete-promo]')?.dataset.deletePromo;
    if (editCode) openPromoForm(promotionsCache.find((p) => p.code === editCode));
    if (deleteCode) {
        if (!window.confirm(`ลบโค้ด ${deleteCode} ?`)) return;
        const result = await withButton(event.target, () => api.request(`/api/admin/promotions/${encodeURIComponent(deleteCode)}`, { method: 'DELETE' }));
        if (!result) return;
        toast(result.message || 'ลบโค้ดแล้ว');
        loadPromotions();
    }
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
async function loadUsers() {
    loading($('#users-table'));
    let users;
    try {
        users = await api.request('/api/admin/users');
    } catch (error) {
        toast(error.message, 'error');
        return;
    }
    $('#users-table').innerHTML = `<table class="table">
        <thead><tr><th>อีเมล</th><th>ชื่อ</th><th class="num">คะแนน</th><th>สมัครเมื่อ</th><th>สิทธิ์</th><th></th></tr></thead>
        <tbody>${users.length ? users.map((u) => `<tr>
            <td>${esc(u.email || '-')}</td><td>${esc(u.displayName || '-')}</td><td class="num">${Number(u.loyaltyPoints || 0).toLocaleString('th-TH')}</td>
            <td class="text-xs text-slate-500">${esc(dateTimeTh(u.createdAt))}</td>
            <td>${u.role === 'admin' ? badge('ผู้ดูแลระบบ', 'bg-slate-900 text-white') : badge('ลูกค้า', 'bg-slate-100 text-slate-600')}</td>
            <td class="text-right">${u.uid === me?.uid ? '<span class="text-xs text-slate-400">บัญชีของคุณ</span>' : `<button class="btn btn-ghost btn-sm" data-role-uid="${esc(u.uid)}" data-role="${u.role === 'admin' ? 'customer' : 'admin'}" type="button">${u.role === 'admin' ? 'ถอนสิทธิ์แอดมิน' : 'ให้สิทธิ์แอดมิน'}</button>`}</td>
        </tr>`).join('') : emptyRow('ยังไม่มีผู้ใช้', 6)}</tbody></table>`;
}

$('#users-table').addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-role-uid]');
    if (!btn) return;
    const toAdmin = btn.dataset.role === 'admin';
    if (!window.confirm(toAdmin ? 'ให้ผู้ใช้นี้เป็นผู้ดูแลระบบ?' : 'ถอนสิทธิ์ผู้ดูแลระบบของผู้ใช้นี้?')) return;
    const result = await withButton(btn, () => api.request(`/api/admin/users/${encodeURIComponent(btn.dataset.roleUid)}/role`, { method: 'PUT', body: { role: btn.dataset.role } }));
    if (!result) return;
    toast('อัปเดตสิทธิ์แล้ว');
    loadUsers();
});
