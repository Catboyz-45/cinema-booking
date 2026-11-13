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
    return `<span class="pill ${className}">${esc(text)}</span>`;
}
const icon = (name, extra = '') => `<span class="material-symbols-outlined ${extra}" aria-hidden="true">${name}</span>`;
function kpiHtml([iconName, tone, label, value, unit], extra = '') {
    return `<div class="card kpi ${extra}"><span class="kpi-icon ${tone}">${icon(iconName)}</span>
        <div class="min-w-0"><p>${label}</p><strong>${esc(value)}${unit ? `<small class="text-sm font-semibold ml-1" style="color:var(--muted)">${unit}</small>` : ''}</strong></div></div>`;
}
const initial = (text) => esc((String(text || '?').trim()[0] || '?').toUpperCase());

let toastTimer = null;
function toast(message, type = 'success') {
    const el = $('#toast');
    el.innerHTML = `${icon(type === 'error' ? 'error' : 'check_circle')}<span>${esc(message)}</span>`;
    el.className = `toast no-print ${type === 'error' ? 'error' : ''}`;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

/**
 * Styled replacement for window.confirm / window.prompt.
 * Resolves to true (or the typed text when `input` is given), or null when cancelled.
 */
function confirmDialog({ title, message = '', confirmText = 'ยืนยัน', danger = false, iconName, input = null }) {
    const box = $('#confirm');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const iconBox = $('#confirm-icon');
    iconBox.className = `confirm-icon ${danger ? 'tone-pink' : 'tone-blue'}`;
    if (danger) iconBox.style.cssText = 'background:var(--bad-50);color:var(--bad)';
    else iconBox.style.cssText = '';
    iconBox.querySelector('.material-symbols-outlined').textContent = iconName || (danger ? 'delete' : 'help');
    const ok = $('#confirm-ok');
    ok.textContent = confirmText;
    ok.className = `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`;
    $('#confirm-input-wrap').classList.toggle('hidden', !input);
    if (input) {
        $('#confirm-input-label').textContent = input.label;
        $('#confirm-input').value = input.value || '';
    }
    box.classList.remove('hidden');
    (input ? $('#confirm-input') : $('#confirm-cancel')).focus();
    return new Promise((resolve) => {
        const finish = (value) => {
            box.classList.add('hidden');
            $('#confirm-form').removeEventListener('submit', onSubmit);
            $('#confirm-cancel').removeEventListener('click', onCancel);
            box.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey, true);
            resolve(value);
        };
        const onSubmit = (event) => { event.preventDefault(); finish(input ? $('#confirm-input').value.trim() : true); };
        const onCancel = () => finish(null);
        const onBackdrop = (event) => { if (event.target === box) finish(null); };
        const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); finish(null); } };
        $('#confirm-form').addEventListener('submit', onSubmit);
        $('#confirm-cancel').addEventListener('click', onCancel);
        box.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey, true);
    });
}

function openModal(title, html, options = {}) {
    $('#modal').classList.toggle('modal-wide', Boolean(options.wide));
    $('#modal-title').textContent = title;
    $('#modal-sub').textContent = options.sub || '';
    $('#modal-sub').classList.toggle('hidden', !options.sub);
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
    $('#modal').classList.remove('modal-wide');
    $('#modal-body').innerHTML = '';
}

function emptyState(message, iconName = 'inbox', sub = '') {
    return `<div class="empty">${icon(iconName)}<b>${esc(message)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
}

function emptyRow(message, colspan = 10, iconName = 'inbox') {
    return `<tr><td colspan="${colspan}" style="padding:0">${emptyState(message, iconName)}</td></tr>`;
}

// ---- pagination (client side) ----
const PAGE_SIZE = { showtimes: 15, bookings: 15, users: 15, movies: 18, promotions: 12, dashShowtimes: 8, sales: 15, rmovies: 15, rshowtimes: 15 };
const pageState = {};
const pageRenderers = {};
let printingAll = false;

function pageNumbers(page, pages) {
    const out = [];
    for (let n = 1; n <= pages; n += 1) {
        if (n === 1 || n === pages || Math.abs(n - page) <= 1) out.push(n);
        else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
}

function paginate(key, items) {
    const size = PAGE_SIZE[key] || 15;
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(1, pageState[key] || 1), pages);
    pageState[key] = page;
    if (printingAll || pages === 1) return { rows: items, pager: '' };
    const start = (page - 1) * size;
    const end = Math.min(start + size, total);
    const button = (n, label, extra = '') => `<button type="button" class="pager-btn ${extra}" data-pager="${key}" data-page="${n}" ${label ? `aria-label="${label}"` : ''}`;
    return {
        rows: items.slice(start, end),
        pager: `<nav class="pager no-print" aria-label="เปลี่ยนหน้า">
            <span class="pager-info">แสดง <b>${start + 1}–${end}</b> จาก ${total.toLocaleString('th-TH')} รายการ</span>
            <div class="pager-btns">
                ${button(page - 1, 'หน้าก่อนหน้า')} ${page === 1 ? 'disabled' : ''}>${icon('chevron_left')}</button>
                ${pageNumbers(page, pages).map((n) => (n === '…'
                    ? '<span class="pager-gap">…</span>'
                    : `${button(n, `หน้า ${n}`, n === page ? 'active' : '')} ${n === page ? 'aria-current="page"' : ''}>${n}</button>`)).join('')}
                ${button(page + 1, 'หน้าถัดไป')} ${page === pages ? 'disabled' : ''}>${icon('chevron_right')}</button>
            </div>
        </nav>`
    };
}

const resetPage = (key) => { pageState[key] = 1; };
const tableBox = (table, pager = '') => `<div class="table-scroll">${table}</div>${pager}`;

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pager]');
    if (!button || button.disabled) return;
    const key = button.dataset.pager;
    const container = button.closest('.card') || button.closest('[id]');
    pageState[key] = Number(button.dataset.page);
    pageRenderers[key]?.();
    if (container && container.getBoundingClientRect().top < 90) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function loading(target) {
    target.innerHTML = '<div class="skeleton" aria-label="กำลังโหลด"><i></i><i></i><i></i><i></i></div>';
}

async function withButton(target, task) {
    const button = target?.closest ? target.closest('button') : target;
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
    const target = document.getElementById(elementId);
    const wasHidden = target.classList.contains('hidden');
    target.classList.remove('hidden');
    const key = elementId.replace('report-', '');
    printingAll = true;
    reportRenderers[key]?.();
    window.addEventListener('afterprint', () => {
        hidden.forEach((el) => el.classList.remove('print-hide'));
        if (wasHidden) target.classList.add('hidden');
        printingAll = false;
        reportRenderers[key]?.();
    }, { once: true });
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

const PAGE_CRUMBS = {
    dashboard: 'Cinema Admin', bookings: 'หน้าโรง', movies: 'โปรแกรมฉาย', showtimes: 'โปรแกรมฉาย',
    pricing: 'การขาย', promotions: 'การขาย', reports: 'การขาย', users: 'ระบบ'
};

function setSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#sidebar-backdrop').classList.toggle('open', open);
    $('#menu-btn').setAttribute('aria-expanded', String(open));
}

let currentTab = null;
async function route() {
    const [tab, action] = (window.location.hash || '#dashboard').slice(1).split('/');
    const active = loaders[tab] ? tab : 'dashboard';
    document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== active));
    document.querySelectorAll('.nav-btn[data-tab]').forEach((btn) => {
        const on = btn.dataset.tab === active;
        btn.classList.toggle('active', on);
        if (on) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    const navLabel = document.querySelector(`.nav-btn[data-tab="${active}"]`)?.lastChild.textContent.trim();
    $('#page-title').textContent = navLabel || 'ภาพรวม';
    $('#page-crumb').textContent = PAGE_CRUMBS[active];
    document.title = `${navLabel || 'ภาพรวม'} • Cinema Admin`;
    setSidebar(false);
    if (currentTab !== active) window.scrollTo({ top: 0 });
    currentTab = active;
    if (active !== 'bookings') stopScanner();
    await loaders[active]();
    if (action === 'new') {
        history.replaceState(null, '', `#${active}`);
        if (active === 'movies') openMovieForm();
        if (active === 'showtimes') toggleShowtimeForm(true);
    }
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
    const name = me.displayName && me.displayName !== 'ผู้ใช้' ? me.displayName : user.email.split('@')[0];
    $('#admin-avatar').innerHTML = initial(name);
    $('#dash-hello').textContent = name;
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
window.addEventListener('hashchange', route);
document.querySelectorAll('.nav-btn[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    if (window.location.hash.slice(1) === btn.dataset.tab) setSidebar(false);
    else window.location.hash = btn.dataset.tab;
}));
$('#menu-btn').addEventListener('click', () => setSidebar(!$('#sidebar').classList.contains('open')));
$('#sidebar-backdrop').addEventListener('click', () => setSidebar(false));
window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });
$('#quick-checkin').addEventListener('click', () => {
    if (window.location.hash !== '#bookings') window.location.hash = 'bookings';
    setTimeout(() => $('#checkin-code').focus(), 50);
});
document.querySelectorAll('[data-reload]').forEach((btn) => btn.addEventListener('click', () => loaders[btn.dataset.reload]()));
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#modal').classList.contains('hidden')) closeModal();
    else if (!$('#st-modal').classList.contains('hidden')) toggleShowtimeForm(false);
    else setSidebar(false);
});

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------
function occupancyBar(booked, held, capacity) {
    const bookedPct = Math.round((booked / capacity) * 100);
    const heldPct = Math.round((held / capacity) * 100);
    return `<div class="occ" title="จองแล้ว ${booked} • รอชำระ ${held} • ทั้งหมด ${capacity} ที่นั่ง">
        <div class="occ-bar"><i class="b" style="width:${bookedPct}%"></i><i class="h" style="width:${heldPct}%"></i></div>
        <span>${booked}/${capacity}</span>
    </div>`;
}

let dashShowtimes = [];
function renderDashShowtimes() {
    const pg = paginate('dashShowtimes', dashShowtimes);
    $('#dash-showtimes').innerHTML = tableBox(`<table class="table">
        <thead><tr><th>เวลา</th><th>ภาพยนตร์</th><th>โรง</th><th>ที่นั่ง</th><th class="num">เช็คอินแล้ว</th><th class="num">รายได้</th></tr></thead>
        <tbody>${pg.rows.length ? pg.rows.map((row) => `
            <tr class="${row.status !== 'active' ? 'opacity-50' : ''}">
                <td><span class="cell-title tabular-nums">${esc(row.startTime)}</span><div class="cell-sub tabular-nums">ถึง ${esc(row.endTime)}</div></td>
                <td class="cell-title">${esc(row.movieTitle)}</td>
                <td>${esc(row.cinema)}<div class="cell-sub">${esc(row.hall)}</div></td>
                <td>${occupancyBar(row.booked, row.held, row.capacity)}</td>
                <td class="num">${row.checkedIn}</td>
                <td class="num font-semibold">${money(row.revenue)}</td>
            </tr>`).join('') : emptyRow('วันนี้ไม่มีรอบฉาย', 6, 'event_busy')}</tbody></table>`, pg.pager);
}
pageRenderers.dashShowtimes = renderDashShowtimes;

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
            ['payments', 'tone-pink', 'รายได้วันนี้', money(summary.todayRevenue)],
            ['confirmation_number', 'tone-violet', 'ตั๋วที่ขายวันนี้', summary.todayTickets, 'ใบ'],
            ['receipt_long', 'tone-blue', 'การจองวันนี้', summary.todayBookings, 'รายการ'],
            ['calendar_month', 'tone-green', 'รอบฉายวันนี้', summary.showtimesToday, 'รอบ'],
            ['hourglass_top', 'tone-amber', 'รอชำระเงิน', summary.pendingHolds, 'รายการ']
        ];
        $('#dash-cards').innerHTML = cards.map((card, index) => kpiHtml(card, index === 4 ? 'col-span-2 lg:col-span-1' : '')).join('');

        const max = Math.max(1, ...summary.series.map((row) => row.revenue));
        const weekTotal = summary.series.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
        $('#dash-week-total').textContent = `รวม ${money(weekTotal)}`;
        $('#dash-chart').innerHTML = summary.series.map((row) => `
            <div class="col ${row.date === today ? 'today' : ''}" title="${esc(`${dateTh(row.date)}: ${money(row.revenue)} (${row.tickets} ใบ)`)}">
                <span class="val">${row.revenue ? Number(row.revenue).toLocaleString('th-TH') : ''}</span>
                <div class="bar" style="height:${Math.max(3, Math.round((row.revenue / max) * 100))}%"></div>
                <span class="day">${row.date === today ? 'วันนี้' : esc(api.formatThaiDate(row.date, { weekday: 'short', day: 'numeric' }))}</span>
            </div>`).join('');

        $('#dash-top').innerHTML = summary.topMovies.length
            ? `<ol class="rank">${summary.topMovies.map((movie, index) => `
                <li>
                    <span class="n">${index + 1}</span>
                    <div class="flex-1 min-w-0"><p class="font-semibold truncate">${esc(movie.title)}</p><p class="text-xs" style="color:var(--muted)">${movie.tickets} ใบ</p></div>
                    <span class="text-sm font-bold tabular-nums">${money(movie.revenue)}</span>
                </li>`).join('')}</ol>`
            : emptyState('ยังไม่มียอดขาย', 'local_activity', 'ยอดขาย 7 วันล่าสุดจะแสดงที่นี่');

        dashShowtimes = report.rows;
        resetPage('dashShowtimes');
        renderDashShowtimes();
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

let movieStatusFilter = '';
function renderMovieFilter() {
    const counts = moviesCache.reduce((acc, movie) => {
        const key = MOVIE_STATUS[movie.status] ? movie.status : 'now_showing';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const options = [['', 'ทั้งหมด', moviesCache.length], ...Object.entries(MOVIE_STATUS).map(([key, s]) => [key, s.text, counts[key] || 0])];
    $('#movie-status-filter').innerHTML = options.map(([key, label, count]) => `
        <button aria-pressed="${key === movieStatusFilter}" data-status="${key}" type="button">${esc(label)}<span class="count">${count}</span></button>`).join('');
}

function renderMoviesTable() {
    renderMovieFilter();
    const keyword = $('#movie-search').value.trim().toLowerCase();
    const rows = moviesCache.filter((movie) => (!movieStatusFilter || (MOVIE_STATUS[movie.status] ? movie.status : 'now_showing') === movieStatusFilter)
        && (!keyword || `${movie.titleThai} ${movie.titleEng} ${movie.id}`.toLowerCase().includes(keyword)));
    const pg = paginate('movies', rows);
    if (!rows.length) {
        $('#movies-table').innerHTML = `<div class="card">${emptyState(keyword ? `ไม่พบ "${keyword}"` : 'ยังไม่มีภาพยนตร์ในกลุ่มนี้', 'movie', 'ลองเปลี่ยนคำค้นหรือตัวกรอง หรือกด "เพิ่มภาพยนตร์"')}</div>`;
        return;
    }
    $('#movies-table').innerHTML = `<div class="movie-grid">${pg.rows.map((movie) => {
        const status = MOVIE_STATUS[movie.status] || MOVIE_STATUS.now_showing;
        const poster = movie.posterImage || movie.backdropImage || movie.trailerImage || '';
        const meta = [movie.durationMinutes ? `${movie.durationMinutes} นาที` : '', (movie.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' • ');
        return `<article class="card movie-card">
            <div class="movie-poster" data-edit-movie="${esc(movie.id)}" role="button" tabindex="0" aria-label="แก้ไข ${esc(movieTitle(movie))}"
                ${poster ? `style="background-image:url('${esc(poster).replace(/'/g, '%27')}')"` : ''}>
                ${poster ? '' : `<span class="noimg">${icon('image')}</span>`}
                ${badge(status.text, status.className)}
                ${movie.ageLimit ? `<span class="age">${esc(movie.ageLimit)}</span>` : ''}
            </div>
            <div class="meta"><b title="${esc(movie.titleThai)}">${esc(movie.titleThai)}</b><small>${esc(movie.titleEng || '')}</small><small>${esc(meta || '-')}</small></div>
            <div class="actions">
                <button class="btn btn-ghost btn-sm" data-edit-movie="${esc(movie.id)}" type="button">${icon('edit')}แก้ไข</button>
                <button class="btn btn-danger btn-sm btn-icon" data-delete-movie="${esc(movie.id)}" type="button" title="ลบ" aria-label="ลบ ${esc(movieTitle(movie))}">${icon('delete')}</button>
            </div>
        </article>`;
    }).join('')}</div>${pg.pager}`;
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
    const photo = actor.image || '';
    return `<div class="cast-row grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
        <button class="cast-photo ${photo ? 'has-image' : ''}" type="button" data-cast-photo title="อัปโหลดรูปนักแสดง" aria-label="อัปโหลดรูปนักแสดง"
            ${photo ? `style="background-image:url('${esc(photo).replace(/'/g, '%27')}')"` : ''}>${icon('add_a_photo')}<i class="spinner"></i></button>
        <input type="hidden" data-cast="image" value="${esc(photo)}">
        <input class="hidden" type="file" accept="image/jpeg,image/png,image/webp" data-cast-file tabindex="-1" aria-hidden="true">
        <input class="field" data-cast="name" placeholder="ชื่อนักแสดง" value="${esc(actor.name || '')}" aria-label="ชื่อนักแสดง">
        <input class="field" data-cast="role" placeholder="บทบาท" value="${esc(actor.role || '')}" aria-label="บทบาท">
        <button class="btn btn-danger btn-icon" type="button" data-remove-cast title="ลบนักแสดงคนนี้" aria-label="ลบนักแสดงคนนี้">${icon('delete')}</button>
    </div>`;
}

const MOVIE_FORM_TABS = [
    { key: 'info', icon: 'movie', text: 'ข้อมูลหลัก' },
    { key: 'images', icon: 'image', text: 'รูปภาพ' },
    { key: 'cast', icon: 'groups', text: 'นักแสดง' },
    { key: 'more', icon: 'tune', text: 'เพิ่มเติม' }
];

function movieForm(movie = {}) {
    const status = movie.status || 'now_showing';
    const genres = new Set(movie.genres || []);
    const genreOptions = [...new Set([...DEFAULT_GENRES, ...moviesCache.flatMap((m) => m.genres || []), ...genres])];
    const ratings = movie.ageLimit && !AGE_RATINGS.includes(movie.ageLimit) ? [...AGE_RATINGS, movie.ageLimit] : AGE_RATINGS;
    const castCount = (movie.cast || []).length;
    return `<form id="movie-form" class="mf" novalidate>
        <div class="mf-tabs" role="tablist" aria-label="ส่วนของฟอร์ม">
            ${MOVIE_FORM_TABS.map((tab, index) => `<button type="button" role="tab" id="mf-tab-${tab.key}" data-mf-tab="${tab.key}"
                aria-controls="mf-pane-${tab.key}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">
                ${icon(tab.icon)}<span>${tab.text}</span>${tab.key === 'cast' ? `<b class="mf-count" id="mf-cast-count">${castCount || ''}</b>` : ''}<i class="mf-dot" aria-hidden="true"></i></button>`).join('')}
        </div>
        <div class="mf-layout">
            <div class="mf-main">
                <section class="mf-pane" role="tabpanel" id="mf-pane-info" aria-labelledby="mf-tab-info">
                    <div class="grid sm:grid-cols-2 gap-x-4 gap-y-5">
                        <div><label class="label" for="mf-titleThai">ชื่อภาษาไทย <span class="text-rose-600">*</span></label>
                            <input class="field" id="mf-titleThai" name="titleThai" value="${esc(movie.titleThai || '')}" placeholder="เช่น ธี่หยด 2" autocomplete="off"></div>
                        <div><label class="label" for="mf-titleEng">ชื่อภาษาอังกฤษ</label>
                            <input class="field" id="mf-titleEng" name="titleEng" value="${esc(movie.titleEng || '')}" placeholder="เช่น Death Whisperer 2" autocomplete="off"></div>
                        <div><label class="label" for="mf-duration">ความยาว <span class="text-rose-600">*</span></label>
                            <div class="flex items-center gap-2">
                                <div class="affix flex-1"><input class="field" id="mf-duration" name="durationMinutes" type="number" inputmode="numeric" min="30" max="400" value="${esc(movie.durationMinutes || '')}" placeholder="120"><span>นาที</span></div>
                                <span class="mf-soft" id="mf-duration-text">${esc(durationText(movie.durationMinutes))}</span>
                            </div></div>
                        <div><label class="label" for="mf-release">วันเข้าฉาย</label>
                            <input class="field" id="mf-release" type="date" value="${esc(releaseToInput(movie.releaseDate))}"></div>
                        <div class="sm:col-span-2"><span class="label">สถานะ</span>
                            <div class="segmented" role="group" aria-label="สถานะ" id="mf-status">
                                ${Object.entries(MOVIE_STATUS).map(([value, info]) => `<button type="button" data-value="${value}" aria-pressed="${value === status}">${info.text}</button>`).join('')}
                            </div>
                            <p class="hint">"เก็บถาวร" = ซ่อนจากหน้าเว็บ ลูกค้าจะไม่เห็น</p></div>
                        <div class="sm:col-span-2"><span class="label">เรต</span>
                            <div class="segmented" role="group" aria-label="เรต" id="mf-age">
                                <button type="button" data-value="" aria-pressed="${!movie.ageLimit}">ไม่ระบุ</button>
                                ${ratings.map((r) => `<button type="button" data-value="${esc(r)}" aria-pressed="${movie.ageLimit === r}">${esc(r)}</button>`).join('')}
                            </div></div>
                        <div class="sm:col-span-2"><span class="label">ประเภท <span class="font-normal text-slate-500">(เลือกได้หลายแบบ)</span></span>
                            <div class="flex flex-wrap gap-2" id="mf-genres">
                                ${genreOptions.map((g) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${genres.has(g)}">${esc(g)}</button>`).join('')}
                                <span class="mf-genre-new"><input id="mf-genre-new" placeholder="+ ประเภทอื่น" aria-label="เพิ่มประเภทอื่น"><button type="button" id="mf-genre-add" aria-label="เพิ่มประเภท">${icon('add')}</button></span>
                            </div></div>
                        <div class="sm:col-span-2"><label class="label" for="mf-description">เรื่องย่อ</label>
                            <textarea class="field" id="mf-description" name="description" rows="4" maxlength="3000" placeholder="เล่าเรื่องย่อสั้น ๆ 1-3 ประโยค">${esc(movie.description || '')}</textarea>
                            <p class="hint text-right"><span id="mf-description-count">${(movie.description || '').length}</span>/3000</p></div>
                    </div>
                </section>

                <section class="mf-pane hidden" role="tabpanel" id="mf-pane-images" aria-labelledby="mf-tab-images">
                    <div class="grid sm:grid-cols-[12rem_1fr] gap-6 items-start">
                        ${uploaderHtml('poster', 'posterImage', 'โปสเตอร์ (แนวตั้ง)', movie.posterImage, 'aspect-[2/3]')}
                        <div class="space-y-5">
                            ${uploaderHtml('backdrop', 'backdropImage', 'ภาพพื้นหลัง (แนวนอน)', movie.backdropImage, 'aspect-video')}
                            <div class="mf-tip">${icon('lightbulb')}<p>รองรับ JPG, PNG, WebP ระบบย่อรูปให้อัตโนมัติ<br>ไม่ใส่โปสเตอร์ก็ได้ ระบบจะลองหาให้จากชื่อภาษาอังกฤษ</p></div>
                        </div>
                    </div>
                </section>

                <section class="mf-pane hidden" role="tabpanel" id="mf-pane-cast" aria-labelledby="mf-tab-cast">
                    <p class="hint mb-3 mt-0">กดวงกลมเพื่อใส่รูปนักแสดง • ไม่บังคับ</p>
                    <div class="space-y-2" id="mf-cast">${(movie.cast || []).map(castRowHtml).join('')}</div>
                    <div class="empty mf-cast-empty ${castCount ? 'hidden' : ''}" id="mf-cast-empty">${icon('groups')}<b>ยังไม่มีนักแสดง</b><span>เพิ่มชื่อนักแสดงเพื่อแสดงในหน้ารายละเอียดหนัง</span></div>
                    <button class="btn btn-ghost btn-sm mt-3" type="button" id="mf-cast-add">${icon('person_add')}เพิ่มนักแสดง</button>
                </section>

                <section class="mf-pane hidden" role="tabpanel" id="mf-pane-more" aria-labelledby="mf-tab-more">
                    <div class="grid sm:grid-cols-2 gap-4">
                        <div><label class="label" for="mf-rating">คะแนน (เต็ม 10)</label><input class="field" id="mf-rating" name="rating" value="${esc(movie.rating || '')}" placeholder="8.5" inputmode="decimal"></div>
                        <div><label class="label" for="mf-reviews">จำนวนรีวิว</label><input class="field" id="mf-reviews" name="reviews" value="${esc(movie.reviews || '')}" placeholder="12k"></div>
                    </div>
                    <div class="mt-5 max-w-md">${uploaderHtml('trailer', 'trailerImage', 'ภาพตัวอย่างหนัง (แนวนอน)', movie.trailerImage, 'aspect-video')}</div>
                </section>
            </div>

            <aside class="mf-preview" id="mf-preview" aria-label="ตัวอย่างที่ลูกค้าจะเห็น">
                <p class="mf-preview-label">${icon('visibility')}ตัวอย่างที่ลูกค้าเห็น</p>
                <div class="pv-card">
                    <div class="pv-poster" id="pv-poster">
                        <span class="pv-noimg">${icon('image')}<small>ยังไม่มีโปสเตอร์</small></span>
                        <b class="pv-age hidden" id="pv-age"></b>
                        <span class="pv-status" id="pv-status"></span>
                    </div>
                    <div class="pv-meta">
                        <h5 id="pv-title"></h5>
                        <p id="pv-sub"></p>
                        <div class="pv-tags" id="pv-tags"></div>
                    </div>
                </div>
                <p class="mf-preview-label mt-4">${icon('wallpaper')}หัวหน้ารายละเอียด</p>
                <div class="pv-hero" id="pv-hero"><div><b id="pv-hero-title"></b><small id="pv-hero-sub"></small></div></div>
            </aside>
        </div>

        <div class="modal-actions mf-actions">
            <button class="btn btn-ghost btn-sm mf-preview-toggle" type="button" id="mf-preview-toggle" aria-expanded="false" aria-controls="mf-preview">${icon('visibility')}ตัวอย่าง</button>
            <span class="mf-keyhint">กด <kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}</kbd> + <kbd>S</kbd> เพื่อบันทึก</span>
            <button class="btn btn-ghost" type="button" data-close-modal>ยกเลิก</button>
            <button class="btn btn-primary" type="submit">${icon('save')}${movie.id ? 'บันทึกการแก้ไข' : 'เพิ่มภาพยนตร์'}</button>
        </div>
    </form>`;
}

const IMAGE_URL = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S+)$/i;
const IMAGE_LIMITS = { poster: [800, 1200], backdrop: [1600, 900], trailer: [1600, 900], cast: [400, 400] };
const MAX_UPLOAD_BYTES = 650 * 1024;

function uploaderHtml(key, name, label, value, aspect) {
    return `<div class="uploader" data-uploader="${key}">
        <span class="label">${label}</span>
        <div class="img-drop ${aspect}" id="mf-${key}-preview" role="button" tabindex="0" aria-label="อัปโหลด${label}">
            <span class="drop-empty">${icon('add_photo_alternate')}<b>อัปโหลดรูป</b><small>กดเพื่อเลือก หรือลากไฟล์มาวาง</small></span>
            <span class="drop-change">${icon('photo_camera')}เปลี่ยนรูป</span>
            <span class="drop-busy"><i class="spinner"></i>กำลังอัปโหลด...</span>
        </div>
        <input class="hidden" id="mf-${key}-file" type="file" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-hidden="true">
        <input type="hidden" id="mf-${key}" name="${name}" value="${esc(value || '')}">
        <button class="btn btn-ghost btn-sm mt-2" data-clear-image="${key}" type="button" aria-label="เอา${label}ออก">${icon('delete')}เอารูปออก</button>
    </div>`;
}

const dataUrlBytes = (dataUrl) => Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

async function loadImageFile(file) {
    if (window.createImageBitmap) {
        try { return await createImageBitmap(file); } catch (_error) { /* fall back to <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Resize to fit maxW × maxH and re-encode as JPEG small enough for the API (~650 KB). */
async function shrinkImage(file, maxW, maxH) {
    const image = await loadImageFile(file).catch(() => { throw new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG'); });
    let scale = Math.min(1, maxW / image.width, maxH / image.height);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    for (let attempt = 0; attempt < 4; attempt += 1) {
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        ctx.fillStyle = '#fff'; // transparent PNG → white, not black
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.86, 0.78, 0.7, 0.6]) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrlBytes(dataUrl) <= MAX_UPLOAD_BYTES) return dataUrl;
        }
        scale *= 0.75;
    }
    throw new Error('รูปใหญ่เกินไป ลองใช้รูปที่เล็กลง');
}

async function uploadImageFile(picked, [maxW, maxH]) {
    if (!/^image\/(jpeg|png|webp)$/.test(picked?.type || '')) throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP');
    if (picked.size > 25 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 25 MB');
    const dataUrl = await shrinkImage(picked, maxW, maxH);
    const saved = await api.request('/api/admin/images', { method: 'POST', body: { dataUrl } });
    return { url: `${api.base || window.location.origin}${saved.path}`, size: saved.size };
}

function bindUploader(key) {
    const input = $(`#mf-${key}`);
    const drop = $(`#mf-${key}-preview`);
    const file = $(`#mf-${key}-file`);
    const update = () => {
        const url = input.value.trim();
        const ok = IMAGE_URL.test(url);
        drop.style.backgroundImage = ok ? `url("${url.replace(/"/g, '%22')}")` : '';
        drop.classList.toggle('has-image', ok);
        $(`[data-clear-image="${key}"]`).classList.toggle('hidden', !url);
    };
    const upload = async (picked) => {
        if (!picked) return;
        drop.classList.add('busy');
        try {
            const saved = await uploadImageFile(picked, IMAGE_LIMITS[key]);
            input.value = saved.url;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            toast(`อัปโหลดรูปแล้ว (${Math.round(saved.size / 1024)} KB) — กดบันทึกเพื่อใช้รูปนี้`);
        } catch (error) {
            toast(error.message || 'อัปโหลดรูปไม่สำเร็จ', 'error');
        } finally {
            drop.classList.remove('busy');
        }
    };
    input.addEventListener('input', update);
    drop.addEventListener('click', () => { if (!drop.classList.contains('busy')) file.click(); });
    drop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); file.click(); }
    });
    file.addEventListener('change', () => { upload(file.files[0]); file.value = ''; });
    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('dragging')));
    drop.addEventListener('drop', (event) => {
        event.preventDefault();
        upload(event.dataTransfer?.files?.[0]);
    });
    $(`[data-clear-image="${key}"]`).addEventListener('click', () => {
        input.value = '';
        update();
    });
    update();
}

function showFieldError(input, message) {
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    let holder = input.parentElement;
    if (holder.classList.contains('affix')) holder = holder.parentElement;
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
    openModal(movie ? movieTitle(movie) : 'เพิ่มภาพยนตร์ใหม่', movieForm(movie || {}), {
        wide: true,
        sub: movie ? 'แก้ไขภาพยนตร์' : 'กรอกข้อมูลหลักให้ครบ แล้วกดเพิ่มภาพยนตร์'
    });
    const form = $('#movie-form');
    form.querySelector('[data-close-modal]').addEventListener('click', closeModal);

    // tabs
    const tabs = [...form.querySelectorAll('[data-mf-tab]')];
    const showTab = (key, focus = false) => {
        tabs.forEach((tab) => {
            const on = tab.dataset.mfTab === key;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            $(`#mf-pane-${tab.dataset.mfTab}`).classList.toggle('hidden', !on);
            if (on && focus) tab.focus();
        });
        form.querySelector('.mf-main').scrollTop = 0;
    };
    const paneOf = (el) => el.closest('.mf-pane')?.id.replace('mf-pane-', '');
    form.querySelector('.mf-tabs').addEventListener('click', (event) => {
        const tab = event.target.closest('[data-mf-tab]');
        if (tab) showTab(tab.dataset.mfTab);
    });
    form.querySelector('.mf-tabs').addEventListener('keydown', (event) => {
        const index = tabs.indexOf(document.activeElement);
        if (index < 0) return;
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        showTab(tabs[(next + tabs.length) % tabs.length].dataset.mfTab, true);
    });
    const markTabErrors = () => {
        tabs.forEach((tab) => tab.classList.toggle('has-error', Boolean($(`#mf-pane-${tab.dataset.mfTab}`).querySelector('.invalid'))));
    };
    form.addEventListener('input', (event) => {
        if (event.target.classList.contains('invalid')) {
            event.target.classList.remove('invalid');
            event.target.removeAttribute('aria-invalid');
            const holder = event.target.closest('.affix')?.parentElement?.parentElement || event.target.parentElement;
            holder.querySelector('.field-error')?.remove();
            markTabErrors();
        }
    });

    // mobile: show/hide preview
    $('#mf-preview-toggle').addEventListener('click', () => {
        const open = $('#mf-preview').classList.toggle('open');
        $('#mf-preview-toggle').setAttribute('aria-expanded', String(open));
        $('#mf-preview-toggle').innerHTML = `${icon(open ? 'visibility_off' : 'visibility')}${open ? 'ซ่อนตัวอย่าง' : 'ตัวอย่าง'}`;
    });

    // Ctrl/Cmd + S saves
    const onSaveKey = (event) => {
        if (!document.body.contains(form)) { document.removeEventListener('keydown', onSaveKey); return; }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            form.requestSubmit();
        }
    };
    document.addEventListener('keydown', onSaveKey);

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
    ['poster', 'backdrop', 'trailer'].forEach(bindUploader);

    // cast rows
    const castBox = $('#mf-cast');
    $('#mf-cast-add').addEventListener('click', () => {
        castBox.insertAdjacentHTML('beforeend', castRowHtml());
        castBox.lastElementChild.querySelector('input').focus();
    });
    castBox.addEventListener('click', (event) => {
        if (event.target.closest('[data-remove-cast]')) event.target.closest('.cast-row').remove();
        const photo = event.target.closest('[data-cast-photo]');
        if (photo && !photo.classList.contains('busy')) photo.closest('.cast-row').querySelector('[data-cast-file]').click();
    });
    castBox.addEventListener('change', async (event) => {
        const fileInput = event.target.closest('[data-cast-file]');
        if (!fileInput?.files[0]) return;
        const row = fileInput.closest('.cast-row');
        const photo = row.querySelector('[data-cast-photo]');
        photo.classList.add('busy');
        try {
            const saved = await uploadImageFile(fileInput.files[0], IMAGE_LIMITS.cast);
            row.querySelector('[data-cast="image"]').value = saved.url;
            photo.style.backgroundImage = `url("${saved.url}")`;
            photo.classList.add('has-image');
        } catch (error) {
            toast(error.message || 'อัปโหลดรูปไม่สำเร็จ', 'error');
        } finally {
            photo.classList.remove('busy');
            fileInput.value = '';
        }
    });

    // live preview of the customer card
    const cssUrl = (url) => (IMAGE_URL.test(url) ? `url("${url.replace(/"/g, '%22')}")` : '');
    const updatePreview = () => {
        const titleThai = $('#mf-titleThai').value.trim();
        const titleEng = $('#mf-titleEng').value.trim();
        const poster = $('#mf-poster').value.trim() || $('#mf-backdrop').value.trim() || $('#mf-trailer').value.trim(); // same fallback as the customer site
        const backdrop = $('#mf-backdrop').value.trim() || $('#mf-trailer').value.trim();
        const age = $('#mf-age [aria-pressed="true"]')?.dataset.value || '';
        const statusKey = $('#mf-status [aria-pressed="true"]')?.dataset.value || 'now_showing';
        const picked = [...genreBox.querySelectorAll('[data-genre][aria-pressed="true"]')].map((c) => c.dataset.genre);
        const minutes = durationText($('#mf-duration').value).replace(/^=\s*/, '');
        $('#pv-poster').style.backgroundImage = cssUrl(poster);
        $('#pv-poster').classList.toggle('has-image', Boolean(cssUrl(poster)));
        $('#pv-age').textContent = age;
        $('#pv-age').classList.toggle('hidden', !age);
        $('#pv-status').textContent = MOVIE_STATUS[statusKey]?.text || '';
        $('#pv-status').dataset.status = statusKey;
        $('#pv-title').textContent = titleThai || titleEng || 'ชื่อภาพยนตร์';
        $('#pv-title').classList.toggle('is-empty', !(titleThai || titleEng));
        $('#pv-sub').textContent = [titleThai ? titleEng : '', minutes].filter(Boolean).join(' • ') || 'ความยาว —';
        $('#pv-tags').innerHTML = picked.slice(0, 3).map((g) => `<span>${esc(g)}</span>`).join('') + (picked.length > 3 ? `<span>+${picked.length - 3}</span>` : '');
        $('#pv-hero').style.backgroundImage = cssUrl(backdrop) ? `linear-gradient(180deg, transparent 30%, rgba(22,17,31,.85)), ${cssUrl(backdrop)}` : '';
        $('#pv-hero').classList.toggle('has-image', Boolean(cssUrl(backdrop)));
        $('#pv-hero-title').textContent = titleThai || titleEng || 'ชื่อภาพยนตร์';
        $('#pv-hero-sub').textContent = [age, minutes, picked[0]].filter(Boolean).join(' • ');
        const count = castBox.querySelectorAll('.cast-row').length;
        $('#mf-cast-count').textContent = count || '';
        $('#mf-cast-empty').classList.toggle('hidden', count > 0);
    };
    form.addEventListener('input', updatePreview);
    form.addEventListener('click', () => requestAnimationFrame(updatePreview));
    form.addEventListener('change', updatePreview);
    updatePreview();

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
            if (input.value.trim() && !IMAGE_URL.test(input.value.trim())) {
                showFieldError(input, 'ลิงก์ต้องขึ้นต้นด้วย https://');
                firstInvalid = firstInvalid || input;
            }
        }
        if (firstInvalid) {
            markTabErrors();
            showTab(paneOf(firstInvalid));
            firstInvalid.focus();
            return;
        }
        markTabErrors();

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
$('#movie-search').addEventListener('input', () => { resetPage('movies'); renderMoviesTable(); });
pageRenderers.movies = renderMoviesTable;
$('#movie-status-filter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    movieStatusFilter = button.dataset.status;
    resetPage('movies');
    renderMoviesTable();
});
$('#movies-table').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.movie-poster')) {
        event.preventDefault();
        event.target.click();
    }
});
$('#movies-table').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-movie]')?.dataset.editMovie;
    const deleteId = event.target.closest('[data-delete-movie]')?.dataset.deleteMovie;
    if (editId) openMovieForm(moviesCache.find((movie) => movie.id === editId));
    if (deleteId) {
        const movie = moviesCache.find((item) => item.id === deleteId);
        const ok = await confirmDialog({
            title: `ลบ "${movieTitle(movie)}" ?`,
            message: 'รอบฉายที่ยังไม่มีการจองจะถูกลบไปด้วย ถ้าเรื่องนี้มีประวัติการจอง ระบบจะเก็บถาวรแทนการลบ',
            confirmText: 'ลบภาพยนตร์',
            danger: true
        });
        if (!ok) return;
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

/** One day in the chosen hall: existing shows + each picked time marked ok / past / clash (same rules as the server). */
function planDay(date) {
    const duration = movieDuration();
    const nowMs = Date.now();
    const toEnd = (start, end) => { const e = toMinutes(end); return e <= toMinutes(start) ? e + 1440 : e; }; // ends after midnight
    const existing = stForm.existing.filter((st) => st.date === date)
        .map((st) => ({ start: toMinutes(st.startTime), end: toEnd(st.startTime, st.endTime), title: st.movieTitle, label: `${st.startTime}–${st.endTime} ${st.movieTitle}` }));
    const taken = existing.map((t) => ({ ...t, end: t.end + CLEANUP_MINUTES }));
    const picked = [...stForm.times].sort().map((time) => {
        const start = toMinutes(time);
        const block = { time, start, end: start + duration, status: 'ok', with: '' };
        if (Date.parse(`${date}T${time}:00+07:00`) <= nowMs) block.status = 'past';
        else {
            const hit = taken.find((t) => start < t.end && t.start < start + duration + CLEANUP_MINUTES);
            if (hit) Object.assign(block, { status: 'clash', with: hit.label });
            else taken.push({ start, end: start + duration + CLEANUP_MINUTES, label: `${time} (รอบใหม่)` });
        }
        return block;
    });
    return { existing, picked };
}

function planShowtimes() {
    const from = $('#st-from').value;
    const days = daysBetween(from, $('#st-to').value);
    const plan = { create: 0, past: 0, clash: 0, byTime: {} };
    for (let i = 0; i < days; i += 1) {
        planDay(addDays(from, i)).picked.forEach((block) => {
            const info = plan.byTime[block.time] || (plan.byTime[block.time] = { past: 0, clash: 0, with: '' });
            if (block.status === 'ok') plan.create += 1;
            else {
                plan[block.status] += 1;
                info[block.status] += 1;
                if (block.with) info.with = info.with || block.with;
            }
        });
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
        ? `${icon('info')}<div><p class="font-bold mb-1">${esc(cinema)} ${esc(stForm.hall)} มีรอบอยู่แล้วในช่วงนี้</p>
           <div class="flex flex-wrap gap-1.5">${[...unique.entries()].sort().map(([key, n]) => {
               const [start, end, title] = key.split('|');
               return `<span class="inline-block rounded-md bg-white border border-slate-200 px-2 py-1 text-xs"><b>${esc(start)}–${esc(end)}</b> ${esc(title)}${n > 1 ? ` <span class="text-slate-400">(${n} วัน)</span>` : ''}</span>`;
           }).join('')}</div></div>`
        : `${icon('check_circle')}<p class="text-emerald-700 font-semibold">${esc(cinema)} ${esc(stForm.hall)} ยังว่างทั้งช่วงวันที่นี้</p>`;
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
    const whereDone = Boolean(selectedMovie() && currentCinemaName() && stForm.hall);
    const whenDone = Boolean(days && stForm.times.size);
    [['where', whereDone, '1'], ['when', whenDone, '2']].forEach(([key, done, num]) => {
        $(`#st-step-${key}`).classList.toggle('done', done);
        $(`#st-step-${key}`).innerHTML = done ? icon('check') : num;
    });
    renderShowtimePreview();
}

let stPreviewOffset = 0;
const TIMELINE_START = 9 * 60;
function renderShowtimePreview() {
    const movie = selectedMovie();
    const from = $('#st-from').value;
    const days = daysBetween(from, $('#st-to').value);
    const poster = movie?.posterImage || movie?.backdropImage || '';
    $('#stp-movie').innerHTML = movie
        ? `<span class="stp-poster" style="${IMAGE_URL.test(poster) ? `background-image:url('${esc(poster).replace(/'/g, '%27')}')` : ''}"></span>
           <div class="min-w-0"><b>${esc(movieTitle(movie))}</b><small>${esc(durationText(movie.durationMinutes).replace(/^=\s*/, '') || '')}</small>
           <div class="stp-tags"><span>${esc(stForm.format)}</span><span>${esc(stForm.type)}</span></div></div>`
        : '<p class="hint">ยังไม่ได้เลือกภาพยนตร์</p>';
    stPreviewOffset = Math.max(0, Math.min(stPreviewOffset, Math.max(days - 1, 0)));
    const date = days ? addDays(from, stPreviewOffset) : '';
    $('#stp-date').textContent = date ? `${dateTh(date)}${days > 1 ? ` (วันที่ ${stPreviewOffset + 1}/${days})` : ''}` : 'ยังไม่ได้เลือกวัน';
    $('#stp-hall').textContent = currentCinemaName() && stForm.hall ? `${currentCinemaName()} • ${stForm.hall}` : 'ยังไม่ได้เลือกโรง';
    $('#stp-prev').disabled = stPreviewOffset <= 0;
    $('#stp-next').disabled = stPreviewOffset >= days - 1;
    if (!date || !stForm.hall) {
        $('#stp-timeline').innerHTML = `<div class="stp-empty">${icon('calendar_month')}<span>เลือกโรงและวันที่<br>เพื่อดูตารางของโรงนี้</span></div>`;
        return;
    }
    $('#stp-timeline').innerHTML = timelineHtml(planDay(date));
    scrollToBlock($('#st-preview'), $('#stp-timeline'));
}

/** Keep the first new/clashing block visible inside the preview column. */
function scrollToBlock(panel, timeline) {
    const block = timeline.querySelector('.stp-block.new, .stp-block.bad');
    if (!block || !panel.offsetParent) return;
    const top = block.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    if (top < panel.scrollTop + 40 || top > panel.scrollTop + panel.clientHeight - 80) panel.scrollTo({ top: Math.max(0, top - panel.clientHeight / 2), behavior: 'smooth' });
}

/** Vertical day schedule of one hall: grey = existing shows, pink = new, striped red = skipped. */
function timelineHtml({ existing, picked }, okText = 'รอบใหม่') {
    const lastEnd = Math.max(24 * 60, ...existing.map((b) => b.end), ...picked.map((b) => b.end));
    const firstStart = Math.min(TIMELINE_START, ...existing.map((b) => b.start), ...picked.map((b) => b.start));
    const startH = Math.floor(firstStart / 60);
    const endH = Math.ceil(lastEnd / 60);
    const span = (endH - startH) * 60;
    const pos = (start, end) => `top:${((start - startH * 60) / span) * 100}%;height:${Math.max(((end - start) / span) * 100, 3)}%`;
    const hours = [];
    for (let h = startH; h <= endH; h += 2) hours.push(`<span class="stp-hour" style="top:${(((h - startH) * 60) / span) * 100}%">${String(h % 24).padStart(2, '0')}:00</span>`);
    const statusText = { ok: okText, past: 'เวลาผ่านไปแล้ว', clash: 'ชนกับรอบอื่น' };
    return `${hours.join('')}<div class="stp-track">
        ${existing.map((b) => `<div class="stp-block old" style="${pos(b.start, b.end)}" title="${esc(b.label)}"><b>${toTime(b.start)}</b> ${esc(b.title)}</div>`).join('')}
        ${picked.map((b) => `<div class="stp-block ${b.status === 'ok' ? 'new' : 'bad'}" style="${pos(b.start, b.end)}" title="${esc(`${b.time} ${statusText[b.status]}${b.with ? ` (${b.with})` : ''}`)}"><b>${b.time}–${toTime(b.end)}</b> ${statusText[b.status]}</div>`).join('')}
    </div>`;
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
    renderShowtimes();
}

let showtimeDay = null;
function renderShowtimes() {
    const today = todayBangkok();
    const dates = [...new Set(showtimesCache.map((st) => st.date))].sort();
    if (!dates.includes(showtimeDay)) showtimeDay = dates.includes(today) ? today : (dates[0] || null);
    $('#st-day-tabs').innerHTML = dates.map((date) => {
        const count = showtimesCache.filter((st) => st.date === date).length;
        return `<button type="button" class="day-tab ${date === showtimeDay ? 'active' : ''}" data-day="${date}" aria-pressed="${date === showtimeDay}">
            <small>${date === today ? 'วันนี้' : esc(api.formatThaiDate(date, { weekday: 'short' }))}</small>
            <b>${Number(date.slice(8, 10))}</b>
            <span>${esc(api.formatThaiDate(date, { month: 'short' }))} • ${count} รอบ</span>
        </button>`;
    }).join('');
    $('#st-day-tabs').classList.toggle('hidden', dates.length === 0);
    const dayRows = showtimesCache.filter((st) => st.date === showtimeDay);
    const pg = paginate('showtimes', dayRows);
    const rows = pg.rows.map((st) => `<tr class="${st.status !== 'active' ? 'opacity-55' : ''}">
            <td><span class="cell-title tabular-nums text-base">${esc(st.startTime)}</span><div class="cell-sub tabular-nums">ถึง ${esc(st.endTime)}</div></td>
            <td class="cell-title">${esc(st.movieTitle)}</td>
            <td>${esc(st.cinema)}<div class="cell-sub">${esc(st.hall)}</div></td>
            <td>${esc(st.format)}<div class="cell-sub">${esc(st.type || '')}</div></td>
            <td>${occupancyBar(st.bookedSeats, st.heldSeats, st.capacity)}</td>
            <td>${st.status === 'active' ? badge('เปิดจอง', 'tone-green') : badge(st.status === 'legacy' ? 'ข้อมูลเก่า' : 'ปิดรอบ', 'bg-slate-200 text-slate-600')}</td>
            <td><div class="row-actions">
                <button class="btn btn-ghost btn-sm btn-icon" data-seats="${esc(st.id)}" type="button" title="ผังที่นั่ง" aria-label="ผังที่นั่ง">${icon('event_seat')}</button>
                <button class="btn btn-ghost btn-sm btn-icon" data-edit-st="${esc(st.id)}" type="button" title="แก้ไข" aria-label="แก้ไขรอบ">${icon('edit')}</button>
                <button class="btn btn-danger btn-sm btn-icon" data-delete-st="${esc(st.id)}" type="button" title="ลบ" aria-label="ลบรอบ">${icon('delete')}</button>
            </div></td>
        </tr>`).join('');
    $('#showtimes-table').innerHTML = tableBox(`<table class="table">
        <thead><tr><th>เวลา</th><th>ภาพยนตร์</th><th>โรง</th><th>ระบบ</th><th>ที่นั่ง</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows || emptyRow('ไม่มีรอบฉายในช่วงวันที่นี้', 7, 'event_busy')}</tbody></table>`, pg.pager);
}
pageRenderers.showtimes = renderShowtimes;

function showStTab(key, focus = false) {
    document.querySelectorAll('[data-st-tab]').forEach((tab) => {
        const on = tab.dataset.stTab === key;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        $(`#st-pane-${tab.dataset.stTab}`).classList.toggle('hidden', !on);
        if (on && focus) tab.focus();
    });
    $('#showtime-form .mf-main').scrollTop = 0;
}
function toggleShowtimeForm(open) {
    $('#st-modal').classList.toggle('hidden', !open);
    $('#st-open-btn').setAttribute('aria-expanded', String(open));
    if (open) {
        showStTab('where');
        $('#st-preview').classList.remove('open');
        renderSummary();
        $('#st-movie').focus();
    }
}
$('#st-open-btn').addEventListener('click', () => toggleShowtimeForm(true));
$('#st-close-btn').addEventListener('click', () => toggleShowtimeForm(false));
$('#showtime-form [data-st-cancel]').addEventListener('click', () => toggleShowtimeForm(false));
$('#st-modal').addEventListener('click', (event) => { if (event.target.id === 'st-modal') toggleShowtimeForm(false); });
$('#showtime-form .mf-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-st-tab]');
    if (tab) showStTab(tab.dataset.stTab);
});
$('#showtime-form .mf-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    showStTab($('[data-st-tab="where"]').getAttribute('aria-selected') === 'true' ? 'when' : 'where', true);
});
$('#st-next').addEventListener('click', () => showStTab('when'));
$('#stp-prev').addEventListener('click', () => { stPreviewOffset -= 1; renderShowtimePreview(); });
$('#stp-next').addEventListener('click', () => { stPreviewOffset += 1; renderShowtimePreview(); });
$('#st-preview-toggle').addEventListener('click', () => {
    const open = $('#st-preview').classList.toggle('open');
    $('#st-preview-toggle').setAttribute('aria-expanded', String(open));
    $('#st-preview-toggle').innerHTML = `${icon(open ? 'visibility_off' : 'visibility')}${open ? 'ซ่อนตัวอย่าง' : 'ตัวอย่าง'}`;
});

$('#st-filter-btn').addEventListener('click', () => {
    resetPage('showtimes');
    showtimeDay = null;
    loadShowtimes();
});
$('#st-day-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-day]');
    if (!tab) return;
    showtimeDay = tab.dataset.day;
    resetPage('showtimes');
    renderShowtimes();
});
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
    $('#showtime-result').innerHTML = `<div class="result ${result.created.length ? 'ok' : 'error'}" style="${result.created.length ? '' : 'background:var(--warn-50);border-color:#f5d28f;color:#7a4a00'}">
        <div class="flex items-start justify-between gap-3"><h4>${icon(result.created.length ? 'check_circle' : 'warning')}สร้างรอบฉาย ${esc(movieTitle(selectedMovie()))} แล้ว ${result.created.length} รอบ${result.skipped.length ? ` • ข้าม ${result.skipped.length} รอบ` : ''}</h4>
        <button class="icon-btn" type="button" data-dismiss-result aria-label="ปิดข้อความ">${icon('close')}</button></div>${skipped}</div>`;
    $('#showtime-result').classList.remove('hidden');
    toast(`สร้างรอบฉายแล้ว ${result.created.length} รอบ`);
    stForm.times.clear();
    toggleShowtimeForm(false);
    if (result.created[0]?.date) {
        showtimeDay = result.created[0].date;
        if ($('#st-filter-from').value > showtimeDay) $('#st-filter-from').value = showtimeDay;
        if ($('#st-filter-to').value < showtimeDay) $('#st-filter-to').value = showtimeDay;
    }
    try {
        cinemasCache = await api.request('/api/admin/cinemas');
        stForm.cinema = body.cinema;
        fillCinemaOptions();
    } catch (_error) {
    }
    loadShowtimes();
    loadHallSchedule();
});

$('#showtime-result').addEventListener('click', (event) => {
    if (event.target.closest('[data-dismiss-result]')) $('#showtime-result').classList.add('hidden');
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
    const seatsTaken = (st.bookedSeats || 0) + (st.heldSeats || 0);
    const locked = seatsTaken > 0;
    const movie = moviesCache.find((m) => m.id === st.movieId);
    const duration = Number(movie?.durationMinutes) || (toMinutes(st.endTime) - toMinutes(st.startTime)) || 120;
    const formats = FORMAT_OPTIONS.includes(st.format) ? FORMAT_OPTIONS : [...FORMAT_OPTIONS, st.format];
    const cinemaNames = [...new Set([...cinemasCache.map((c) => c.name), st.cinema])];
    const poster = movie?.posterImage || movie?.backdropImage || '';
    const dis = locked ? 'disabled' : '';
    openModal(st.movieTitle, `<form id="st-edit-form" class="mf" novalidate>
        <div class="mf-layout">
            <div class="mf-main space-y-6">
                ${locked ? `<div class="mf-tip warn">${icon('lock')}<p><b>รอบนี้มีคนจองแล้ว ${seatsTaken} ที่นั่ง</b> จึงย้ายวัน เวลา หรือโรงไม่ได้ แก้ได้เฉพาะระบบฉายและเสียง ถ้าต้องการปิดรอบ ให้ยกเลิกการจองในเมนู "การจอง / เช็คอิน" ก่อน</p></div>` : ''}
                <div>
                    <div class="grid sm:grid-cols-2 gap-3 max-w-md">
                        <div><label class="label" for="se-date">วันที่</label><input class="field" id="se-date" name="date" type="date" value="${esc(st.date)}" ${dis}></div>
                        <div><label class="label" for="se-time">เวลาเริ่ม</label><input class="field" id="se-time" name="startTime" type="time" value="${esc(st.startTime)}" ${dis}></div>
                    </div>
                    <p class="hint">จบประมาณ <b id="se-end">${esc(st.endTime)}</b> • หนังยาว ${duration} นาที + ทำความสะอาด ${CLEANUP_MINUTES} นาที</p></div>
                <div class="grid sm:grid-cols-2 gap-4">
                    <div><label class="label" for="se-cinema">สาขา</label>
                        <select class="field" id="se-cinema" ${dis}>${cinemaNames.map((name) => `<option value="${esc(name)}" ${name === st.cinema ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
                    <div><span class="label">โรงย่อย</span>
                        <div class="flex flex-wrap gap-2" id="se-halls" role="group" aria-label="โรงย่อย"></div></div>
                </div>
                <div><span class="label">ระบบฉาย</span>
                    <div class="segmented" id="se-format" role="group" aria-label="ระบบฉาย">
                        ${formats.map((f) => `<button type="button" data-value="${esc(f)}" aria-pressed="${f === st.format}">${esc(f)}</button>`).join('')}
                    </div></div>
                <div><span class="label">เสียง / ซับไตเติล</span>
                    <div class="flex flex-wrap gap-2" id="se-types" role="group" aria-label="เสียง / ซับไตเติล">
                        ${TYPE_OPTIONS.map((t) => `<button class="chip" type="button" data-value="${esc(t)}" aria-pressed="${t === st.type}">${esc(t)}</button>`).join('')}
                    </div>
                    <input class="field mt-2 max-w-xs" id="se-type" value="${TYPE_OPTIONS.includes(st.type) ? '' : esc(st.type || '')}" placeholder="หรือพิมพ์เอง" aria-label="เสียง / ซับไตเติล แบบอื่น"></div>
                <div><span class="label">การขายตั๋ว</span>
                    <div class="switch-row">
                        <button class="switch" id="se-status" role="switch" type="button" aria-checked="${st.status === 'active'}" ${locked && st.status === 'active' ? 'disabled' : ''} aria-label="เปิดขายตั๋วรอบนี้"></button>
                        <div><b id="se-status-text"></b><small id="se-status-sub"></small></div>
                    </div></div>
            </div>
            <aside class="mf-preview" id="se-preview" aria-label="ตารางของโรงในวันนั้น">
                <p class="mf-preview-label">${icon('movie')}รอบนี้</p>
                <div class="stp-movie">
                    <span class="stp-poster" style="${IMAGE_URL.test(poster) ? `background-image:url('${esc(poster).replace(/'/g, '%27')}')` : ''}"></span>
                    <div class="min-w-0"><b>${esc(st.movieTitle)}</b><small>${seatsTaken ? `จองแล้ว ${seatsTaken}/${st.capacity || '?'} ที่นั่ง` : 'ยังไม่มีคนจอง'}</small>
                    <div class="stp-tags" id="se-tags"></div></div>
                </div>
                <div class="stp-day"><div><b id="se-day"></b><small id="se-hall-label"></small></div></div>
                <div class="stp-timeline" id="se-timeline"></div>
                <div class="stp-legend"><span class="new">รอบนี้</span><span class="old">รอบอื่นในโรงนี้</span><span class="bad">ชนกัน</span></div>
            </aside>
        </div>
        <div class="modal-actions mf-actions">
            <button class="btn btn-ghost btn-sm mf-preview-toggle" type="button" id="se-preview-toggle" aria-expanded="false" aria-controls="se-preview">${icon('calendar_view_day')}ตาราง</button>
            <div class="st-summary"><p class="font-bold" id="se-summary"></p></div>
            <button class="btn btn-ghost" type="button" data-close-modal>ยกเลิก</button>
            <button class="btn btn-primary" type="submit">${icon('save')}บันทึก</button>
        </div>
    </form>`, { wide: true, sub: `แก้ไขรอบฉาย • ${dateTh(st.date)} ${st.startTime}` });

    const form = $('#st-edit-form');
    const state = { hall: st.hall, format: st.format, type: st.type || '', clash: null };
    const dayCache = new Map();
    form.querySelector('[data-close-modal]').addEventListener('click', closeModal);

    const renderHalls = () => {
        const cinema = cinemasCache.find((c) => c.name === $('#se-cinema').value);
        const halls = [...new Set([...(cinema?.halls || []), ...($('#se-cinema').value === st.cinema ? [st.hall] : [])])]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (!halls.includes(state.hall)) state.hall = halls[0] || '';
        $('#se-halls').innerHTML = halls.map((hall) => `<button class="chip" type="button" data-hall="${esc(hall)}" aria-pressed="${hall === state.hall}" ${dis}>${esc(hall)}</button>`).join('')
            || '<span class="hint">สาขานี้ยังไม่มีโรงย่อย</span>';
    };

    const dayShows = async (date) => {
        if (!dayCache.has(date)) {
            dayCache.set(date, api.request(`/api/admin/showtimes?${new URLSearchParams({ from: date, to: date })}`).catch(() => []));
        }
        return dayCache.get(date);
    };

    let renderId = 0;
    const render = async () => {
        const id = ++renderId;
        const date = $('#se-date').value;
        const time = $('#se-time').value;
        const active = $('#se-status').getAttribute('aria-checked') === 'true';
        if (time) $('#se-end').textContent = toTime(toMinutes(time) + duration);
        $('#se-status-text').textContent = active ? 'เปิดขายตั๋ว' : 'ปิดรอบ';
        $('#se-status-sub').textContent = active ? 'ลูกค้าเห็นและจองรอบนี้ได้' : 'ลูกค้าจะไม่เห็นรอบนี้';
        $('#se-tags').innerHTML = [state.format, state.type].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
        $('#se-day').textContent = date ? dateTh(date) : 'ยังไม่ได้เลือกวัน';
        $('#se-hall-label').textContent = `${$('#se-cinema').value} • ${state.hall || '-'}`;
        if (!date || !time || !state.hall) {
            $('#se-timeline').innerHTML = `<div class="stp-empty">${icon('calendar_month')}<span>เลือกวัน เวลา และโรง</span></div>`;
            return;
        }
        const rows = await dayShows(date);
        if (id !== renderId) return;
        const toEnd = (start, end) => { const e = toMinutes(end); return e <= toMinutes(start) ? e + 1440 : e; };
        const existing = rows
            .filter((row) => row.id !== st.id && row.status === 'active' && row.cinema === $('#se-cinema').value && row.hall === state.hall)
            .map((row) => ({ start: toMinutes(row.startTime), end: toEnd(row.startTime, row.endTime), title: row.movieTitle, label: `${row.startTime}–${row.endTime} ${row.movieTitle}` }));
        const start = toMinutes(time);
        const block = { time, start, end: start + duration, status: 'ok', with: '' };
        // same rule as the server: only a moved, active showtime is checked for clashes
        const moved = date !== st.date || time !== st.startTime || $('#se-cinema').value !== st.cinema || state.hall !== st.hall;
        const hit = active && existing.find((t) => start < t.end + CLEANUP_MINUTES && t.start < start + duration + CLEANUP_MINUTES);
        if (moved && Date.parse(`${date}T${time}:00+07:00`) <= Date.now()) block.status = 'past';
        else if (hit) Object.assign(block, { status: 'clash', with: hit.label });
        state.clash = moved && block.status !== 'ok' ? block : null;
        $('#se-timeline').innerHTML = timelineHtml({ existing, picked: [block] }, 'รอบนี้');
        scrollToBlock($('#se-preview'), $('#se-timeline'));
        $('#se-summary').innerHTML = block.status === 'clash' && !moved
            ? `<span class="text-amber-700">⚠ ทับกับ ${esc(hit.label)} มาตั้งแต่เดิม (บันทึกได้)</span>`
            : block.status === 'clash'
            ? `<span class="text-rose-700">⚠ ชนกับ ${esc(block.with)} ย้ายไปเวลาอื่นก่อน</span>`
            : block.status === 'past'
                ? '<span class="text-rose-700">⚠ เวลานี้ผ่านไปแล้ว</span>'
                : `<span class="text-emerald-700">✓ ${existing.length ? 'เวลานี้ไม่ชนกับรอบอื่น' : 'โรงนี้ว่างทั้งวัน'}</span>`;
        form.querySelector('[type=submit]').disabled = Boolean(state.clash);
    };

    $('#se-cinema').addEventListener('change', () => { renderHalls(); render(); });
    $('#se-halls').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-hall]');
        if (!chip) return;
        state.hall = chip.dataset.hall;
        renderHalls();
        render();
    });
    ['#se-date', '#se-time'].forEach((sel) => $(sel).addEventListener('change', render));
    $('#se-time').addEventListener('input', render);
    $('#se-format').addEventListener('click', (event) => {
        const button = event.target.closest('[data-value]');
        if (!button) return;
        state.format = button.dataset.value;
        $('#se-format').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        render();
    });
    $('#se-types').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-value]');
        if (!chip) return;
        state.type = chip.dataset.value;
        $('#se-type').value = '';
        $('#se-types').querySelectorAll('[data-value]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        render();
    });
    $('#se-type').addEventListener('input', () => {
        const typed = $('#se-type').value.trim();
        if (typed) {
            state.type = typed;
            $('#se-types').querySelectorAll('[data-value]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        }
        render();
    });
    $('#se-status').addEventListener('click', () => {
        $('#se-status').setAttribute('aria-checked', String($('#se-status').getAttribute('aria-checked') !== 'true'));
        render();
    });
    $('#se-preview-toggle').addEventListener('click', () => {
        const open = $('#se-preview').classList.toggle('open');
        $('#se-preview-toggle').setAttribute('aria-expanded', String(open));
        $('#se-preview-toggle').innerHTML = `${icon(open ? 'visibility_off' : 'calendar_view_day')}${open ? 'ซ่อนตาราง' : 'ตาราง'}`;
    });
    renderHalls();
    render();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.clash) return;
        const body = {
            format: state.format,
            type: state.type,
            status: $('#se-status').getAttribute('aria-checked') === 'true' ? 'active' : 'cancelled'
        };
        if (!locked) Object.assign(body, { date: $('#se-date').value, startTime: $('#se-time').value, cinema: $('#se-cinema').value, hall: state.hall });
        const saved = await withButton(form.querySelector('[type=submit]'), () => api.request(`/api/admin/showtimes/${encodeURIComponent(st.id)}`, { method: 'PUT', body }));
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
        const ok = await confirmDialog({
            title: 'ลบรอบฉายนี้?',
            message: `${st.movieTitle}\n${dateTh(st.date)} เวลา ${st.startTime} • ${st.cinema} ${st.hall}`,
            confirmText: 'ลบรอบฉาย',
            danger: true
        });
        if (!ok) return;
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
    const item = (label, value, wide = false) => `<div class="${wide ? 'wide' : ''}"><dt>${label}</dt><dd>${value}</dd></div>`;
    return `<dl class="dl">
        ${item('Booking ID', `<b class="font-mono">${esc(b.bookingId)}</b>`)}
        ${item('สถานะ', api.statusBadge(b.status))}
        ${item('ภาพยนตร์', `<b>${esc(b.movie?.title)}</b>`, true)}
        ${item('รอบฉาย', `${esc(dateTh(b.showtime?.date))} เวลา ${esc(b.showtime?.startTime || '')}`)}
        ${item('โรง', `${esc(b.showtime?.cinema || b.movie?.cinema || '')} • ${esc(b.showtime?.hall || b.movie?.hall || '')}`)}
        ${item('ที่นั่ง', `<b>${esc((b.seats || []).join(', '))}</b>`)}
        ${item('ลูกค้า', esc(b.userEmail || '-'))}
        ${item('ยอดชำระ', `<b>${money(b.pricing?.total)}</b>${b.promotion?.code ? ` <span class="pill plain tone-pink">${esc(b.promotion.code)}</span>` : ''}`)}
        ${item('ชำระผ่าน', `${esc(b.payment?.method || '-')}${b.payment?.transactionId ? `<div class="cell-sub font-mono">${esc(b.payment.transactionId)}</div>` : ''}`)}
        ${item('จองเมื่อ', esc(dateTimeTh(b.createdAt)))}
        ${item('ชำระเมื่อ', esc(dateTimeTh(b.paidAt)))}
        ${b.checkedInAt ? item('เช็คอินเมื่อ', esc(dateTimeTh(b.checkedInAt))) : ''}
        ${b.cancelledAt ? item('ยกเลิกเมื่อ', `${esc(dateTimeTh(b.cancelledAt))} — ${esc(b.cancelReason || '')}${b.payment?.status === 'refunded' ? ` (คืนเงิน ${money(b.payment.refundAmount)})` : ''}`, true) : ''}
    </dl>`;
}

async function searchBookings(keepPage = false) {
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
    if (!keepPage) resetPage('bookings');
    renderBookings();
}

function renderBookings() {
    const pg = paginate('bookings', bookingsCache);
    $('#bookings-table').innerHTML = tableBox(`<table class="table">
        <thead><tr><th>การจอง</th><th>ลูกค้า</th><th>ภาพยนตร์ / รอบ</th><th>ที่นั่ง</th><th class="num">ยอด</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${pg.rows.length ? pg.rows.map((b) => `<tr>
            <td><span class="font-mono text-[13px] font-semibold">${esc(b.bookingId)}</span><div class="cell-sub whitespace-nowrap">${esc(dateTimeTh(b.createdAt))}</div></td>
            <td><div class="flex items-center gap-2 min-w-0"><span class="avatar" style="width:30px;height:30px;font-size:12px">${initial(b.userEmail)}</span><span class="truncate max-w-[14rem]">${esc(b.userEmail || '-')}</span></div></td>
            <td><span class="cell-title">${esc(b.movie?.title || '-')}</span><div class="cell-sub">${esc(dateTh(b.showtime?.date))} ${esc(b.showtime?.startTime || '')} • ${esc(b.showtime?.hall || b.movie?.hall || '')}</div></td>
            <td class="font-semibold">${esc((b.seats || []).join(', '))}</td>
            <td class="num font-semibold">${money(b.pricing?.total)}</td>
            <td>${api.statusBadge(b.status)}</td>
            <td><div class="row-actions">
                <button class="btn btn-ghost btn-sm" data-view-bk="${esc(b.bookingId)}" type="button">${icon('visibility')}ดู</button>
                ${['paid', 'pending'].includes(b.status) ? `<button class="btn btn-danger btn-sm" data-cancel-bk="${esc(b.bookingId)}" type="button">${b.status === 'paid' ? 'ยกเลิก/คืนเงิน' : 'ยกเลิก'}</button>` : ''}
            </div></td>
        </tr>`).join('') : emptyRow('ไม่พบการจอง', 7, 'confirmation_number')}</tbody></table>`, pg.pager);
}
pageRenderers.bookings = renderBookings;

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
        const reason = await confirmDialog({
            title: booking.status === 'paid' ? `ยกเลิกและคืนเงิน ${money(booking.pricing?.total)}?` : 'ยกเลิกการจองที่รอชำระ?',
            message: `${cancelId} • ${booking.movie?.title || ''}\nที่นั่ง ${booking.seats.join(', ')} จะถูกปล่อยคืนให้ลูกค้าคนอื่นจองได้`,
            confirmText: booking.status === 'paid' ? 'ยกเลิกและคืนเงิน' : 'ยกเลิกการจอง',
            danger: true,
            iconName: 'block',
            input: { label: 'เหตุผล', value: 'ลูกค้าขอยกเลิก' }
        });
        if (reason === null) return;
        const result = await withButton(event.target, () => api.request(`/api/admin/bookings/${encodeURIComponent(cancelId)}/cancel`, { method: 'POST', body: { reason } }));
        if (!result) return;
        toast(`ยกเลิก ${cancelId} แล้ว`);
        searchBookings(true);
    }
});

function showCheckInResult(kind, message, booking = null, canForce = false) {
    $('#checkin-result').innerHTML = `<div class="result ${kind}">
        <h4>${icon(kind === 'ok' ? 'check_circle' : 'error')}${esc(message)}</h4>
        ${booking ? `<div class="mt-4 rounded-xl bg-white/80 p-4" style="color:var(--ink)">${bookingSummaryHtml(booking)}</div>` : ''}
        ${canForce ? '<button class="btn btn-dark btn-sm mt-3" id="force-checkin" type="button">ยืนยันเช็คอินต่างวัน</button>' : ''}
    </div>`;
}

async function checkIn(code, force = false) {
    if (!code) return;
    try {
        const booking = await api.request('/api/admin/check-in', { method: 'POST', body: { code, force } });
        showCheckInResult('ok', `เช็คอินสำเร็จ — ที่นั่ง ${booking.seats.join(', ')}`, booking);
        $('#checkin-code').value = '';
        searchBookings(true);
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
        resetPage('sales');
        reportRenderers.sales();
    },
    async movies() {
        const params = new URLSearchParams({ from: $('#rm-from').value, to: $('#rm-to').value });
        reportData.movies = await api.request(`/api/admin/reports/movies?${params}`);
        resetPage('rmovies');
        reportRenderers.movies();
    },
    async showtimes() {
        reportData.showtimes = await api.request(`/api/admin/reports/showtimes?date=${$('#rt-date').value}`);
        resetPage('rshowtimes');
        reportRenderers.showtimes();
    }
};

const reportRenderers = {
    sales() {
        const data = reportData.sales;
        const pg = paginate('sales', data.rows);
        const periodLabel = (period) => (data.groupBy === 'month'
            ? new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`))
            : dateTh(period));
        $('#rs-caption').textContent = `${dateTh(data.from)} – ${dateTh(data.to)} (${data.groupBy === 'month' ? 'รายเดือน' : 'รายวัน'}) • นับเฉพาะการจองที่ชำระเงินแล้วและไม่ถูกยกเลิก`;
        $('#rs-kpis').innerHTML = [
            ['payments', 'tone-pink', 'รายได้สุทธิ', money(data.totals.revenue)],
            ['confirmation_number', 'tone-violet', 'ตั๋วที่ขาย', data.totals.tickets, 'ใบ'],
            ['receipt_long', 'tone-blue', 'การจอง', data.totals.bookings, 'รายการ'],
            ['sell', 'tone-amber', 'ส่วนลดรวม', money(data.totals.discount)]
        ].map((card) => kpiHtml(card)).join('');
        $('#rs-table').innerHTML = tableBox(`<table class="table">
            <thead><tr><th>${data.groupBy === 'month' ? 'เดือน' : 'วันที่'}</th><th class="num">การจอง</th><th class="num">ตั๋ว (ใบ)</th><th class="num">ยอดก่อนส่วนลด</th><th class="num">ส่วนลด</th><th class="num">รายได้สุทธิ</th></tr></thead>
            <tbody>${pg.rows.map((row) => `<tr class="${row.revenue ? '' : 'text-slate-400'}">
                <td>${esc(periodLabel(row.period))}</td><td class="num">${row.bookings}</td><td class="num">${row.tickets}</td>
                <td class="num">${money(row.gross)}</td><td class="num">${money(row.discount)}</td><td class="num font-semibold">${money(row.revenue)}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr class="font-extrabold"><td>รวม</td><td class="num">${data.totals.bookings}</td><td class="num">${data.totals.tickets}</td>
                <td class="num">${money(data.totals.gross)}</td><td class="num">${money(data.totals.discount)}</td><td class="num">${money(data.totals.revenue)}</td></tr></tfoot>
        </table>`, pg.pager);
    },
    movies() {
        const data = reportData.movies;
        const pg = paginate('rmovies', data.rows);
        const totalTickets = data.rows.reduce((sum, row) => sum + row.tickets, 0) || 1;
        $('#rm-caption').textContent = `${dateTh(data.from)} – ${dateTh(data.to)} • ตามวันที่ชำระเงิน`;
        $('#rm-table').innerHTML = tableBox(`<table class="table">
            <thead><tr><th>ภาพยนตร์</th><th class="num">การจอง</th><th class="num">ผู้ชม (ตั๋ว)</th><th>สัดส่วน</th><th class="num">เข้าชมแล้ว</th><th class="num">รายได้</th></tr></thead>
            <tbody>${pg.rows.length ? pg.rows.map((row) => `<tr>
                <td class="font-semibold">${esc(row.title)}</td><td class="num">${row.bookings}</td><td class="num">${row.tickets}</td>
                <td><div class="occ" style="min-width:8rem"><div class="occ-bar"><i class="b" style="width:${Math.round((row.tickets / totalTickets) * 100)}%"></i></div><span>${Math.round((row.tickets / totalTickets) * 100)}%</span></div></td>
                <td class="num">${row.checkedIn}</td><td class="num">${money(row.revenue)}</td>
            </tr>`).join('') : emptyRow('ไม่มีข้อมูลในช่วงวันที่นี้', 6)}</tbody></table>`, pg.pager);
    },
    showtimes() {
        const data = reportData.showtimes;
        const pg = paginate('rshowtimes', data.rows);
        $('#rt-caption').textContent = `รอบฉายวันที่ ${api.formatThaiDate(data.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
        $('#rt-table').innerHTML = tableBox(`<table class="table">
            <thead><tr><th>เวลา</th><th>ภาพยนตร์</th><th>โรง</th><th class="num">จองแล้ว</th><th class="num">ว่าง</th><th class="num">% ที่นั่ง</th><th>ที่นั่งที่ถูกจอง</th><th class="num">รายได้</th></tr></thead>
            <tbody>${pg.rows.length ? pg.rows.map((row) => `<tr class="${row.status !== 'active' ? 'text-slate-400' : ''}">
                <td class="whitespace-nowrap font-semibold">${esc(row.startTime)}</td><td>${esc(row.movieTitle)}</td>
                <td>${esc(row.cinema)}<br><span class="text-xs text-slate-500">${esc(row.hall)}</span></td>
                <td class="num">${row.booked}/${row.capacity}</td><td class="num">${row.available}</td><td class="num">${row.occupancyPct}%</td>
                <td class="text-xs">${esc(row.seats.join(', ') || '-')}</td><td class="num">${money(row.revenue)}</td>
            </tr>`).join('') : emptyRow('ไม่มีรอบฉายในวันนี้', 8)}</tbody></table>`, pg.pager);
    }
};
pageRenderers.sales = reportRenderers.sales;
pageRenderers.rmovies = reportRenderers.movies;
pageRenderers.rshowtimes = reportRenderers.showtimes;

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

function showReport(id) {
    document.querySelectorAll('.report-card').forEach((card) => card.classList.toggle('hidden', card.id !== id));
    document.querySelectorAll('[data-report-tab]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.reportTab === id)));
    const key = id.replace('report-', '');
    if (!reportData[key]) withButton(null, () => reportRunners[key]());
}
$('#report-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-report-tab]');
    if (tab) showReport(tab.dataset.reportTab);
});

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

function renderPricingPreview() {
    const n = (id) => Math.max(0, Number($(id).value) || 0);
    const seats = n('#pr-regular') * 2;
    const fee = n('#pr-fee') * 2;
    const points = Math.min(n('#pr-disc'), seats + fee);
    const line = (label, value, extra = '') => `<div class="line ${extra}"><span>${label}</span><span class="tabular-nums">${value}</span></div>`;
    $('#pricing-preview').innerHTML = [
        line(`Regular × 2 (${money(n('#pr-regular'))})`, money(seats)),
        line(`ค่าบริการ × 2 (${money(n('#pr-fee'))})`, money(fee)),
        line(`ใช้ ${n('#pr-req')} คะแนน`, `−${money(points)}`),
        line('ลูกค้าจ่าย', money(seats + fee - points), 'total'),
        `<p class="hint">ได้รับคะแนนเพิ่ม ${n('#pr-earn')} คะแนน • ล็อกที่นั่งรอชำระ ${n('#pr-hold')} นาที</p>`
    ].join('');
}

async function loadPricing() {
    try {
        const pricing = await api.request('/api/admin/settings/pricing');
        PRICING_FIELDS.forEach(([id, get]) => { $(id).value = get(pricing); });
        renderPricingPreview();
    } catch (error) {
        toast(error.message, 'error');
    }
}
$('#pricing-form').addEventListener('input', renderPricingPreview);

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
    resetPage('promotions');
    renderPromotions();
}

function renderPromotions() {
    if (!promotionsCache.length) {
        $('#promotions-table').innerHTML = `<div class="card">${emptyState('ยังไม่มีโค้ดส่วนลด', 'sell', 'กด "สร้างโค้ดส่วนลด" เพื่อเริ่ม')}</div>`;
        return;
    }
    const pg = paginate('promotions', promotionsCache);
    $('#promotions-table').innerHTML = `<div class="promo-grid">${pg.rows.map((p) => {
        const used = p.usedCount || 0;
        const usage = p.totalLimit
            ? `<div class="occ" style="min-width:0;flex:1"><div class="occ-bar"><i class="b" style="width:${Math.min(100, Math.round((used / p.totalLimit) * 100))}%"></i></div><span>${used}/${p.totalLimit}</span></div>`
            : `<span>ใช้ไปแล้ว ${used} ครั้ง • ไม่จำกัดสิทธิ์</span>`;
        return `<article class="card coupon ${p.active ? '' : 'off'}">
            <div class="coupon-top">
                <div class="min-w-0"><p class="coupon-code">${esc(p.code)}</p><p class="text-sm mt-1" style="color:var(--muted)">${esc(p.description || 'ไม่มีคำอธิบาย')}</p></div>
                <div class="text-right shrink-0"><p class="coupon-value">${promoDiscountText(p)}</p><p class="text-xs font-semibold mt-1" style="color:var(--muted)">ส่วนลด</p></div>
            </div>
            <div class="coupon-cut"></div>
            <div class="coupon-body">
                <div class="row">${icon('calendar_month')}${p.daysOfWeek?.length ? esc(p.daysOfWeek.map((d) => DAY_NAMES[d]).join(' ')) : 'ใช้ได้ทุกวัน'}</div>
                <div class="row">${icon('date_range')}${p.startDate ? esc(dateTh(p.startDate)) : 'ไม่จำกัด'} – ${p.endDate ? esc(dateTh(p.endDate)) : 'ไม่จำกัด'}</div>
                <div class="row">${icon('group')}${usage}</div>
            </div>
            <div class="coupon-foot">
                ${p.active ? badge('ใช้งานอยู่', 'tone-green') : badge('ปิดอยู่', 'bg-slate-200 text-slate-600')}
                <div class="row-actions">
                    <button class="btn btn-ghost btn-sm" data-edit-promo="${esc(p.code)}" type="button">${icon('edit')}แก้ไข</button>
                    <button class="btn btn-danger btn-sm btn-icon" data-delete-promo="${esc(p.code)}" type="button" title="ลบ" aria-label="ลบโค้ด ${esc(p.code)}">${icon('delete')}</button>
                </div>
            </div>
        </article>`;
    }).join('')}</div>${pg.pager}`;
}

pageRenderers.promotions = renderPromotions;

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

const PROMO_EXAMPLE_TOTAL = 500;
function renderPromoPreview(data) {
    const value = data.discountValue > 0 ? data.discountValue : 0;
    const used = data.usedCount || 0;
    const validDays = data.daysOfWeek.length ? data.daysOfWeek.map((d) => DAY_NAMES[d]).join(' ') : 'ใช้ได้ทุกวัน';
    const period = `${data.startDate ? dateTh(data.startDate) : 'วันนี้'} – ${data.endDate ? dateTh(data.endDate) : 'ไม่หมดอายุ'}`;
    $('#pf-coupon').classList.toggle('off', !data.active);
    $('#pf-coupon').innerHTML = `
        <div class="coupon-top">
            <div class="min-w-0"><p class="coupon-code">${esc(data.code || 'CODE')}</p><p class="text-sm mt-1" style="color:var(--muted)">${esc(data.description || 'ไม่มีคำอธิบาย')}</p></div>
            <div class="text-right shrink-0"><p class="coupon-value">${value ? promoDiscountText(data) : '—'}</p><p class="text-xs font-semibold mt-1" style="color:var(--muted)">ส่วนลด</p></div>
        </div>
        <div class="coupon-cut"></div>
        <div class="coupon-body">
            <div class="row">${icon('calendar_month')}${esc(validDays)}</div>
            <div class="row">${icon('date_range')}${esc(period)}</div>
            <div class="row">${icon('group')}${data.totalLimit ? `${used}/${data.totalLimit} สิทธิ์` : 'ไม่จำกัดสิทธิ์'}</div>
        </div>
        <div class="coupon-foot">${data.active ? badge('ใช้งานอยู่', 'tone-green') : badge('ปิดอยู่', 'bg-slate-200 text-slate-600')}</div>`;
    const discount = Math.min(PROMO_EXAMPLE_TOTAL, data.discountType === 'percent' ? Math.floor((PROMO_EXAMPLE_TOTAL * Math.min(value, 100)) / 100) : value);
    $('#pf-calc').innerHTML = `
        <div><span>ค่าตั๋ว (ตัวอย่าง)</span><b>${money(PROMO_EXAMPLE_TOTAL)}</b></div>
        <div class="minus"><span>ส่วนลด ${esc(data.code || '')}</span><b>−${money(discount)}</b></div>
        <div class="total"><span>ลูกค้าจ่าย</span><b>${money(PROMO_EXAMPLE_TOTAL - discount)}</b></div>`;
    $('#pf-summary').innerHTML = promoSummaryText(data).split(' • ').map((line) => `<li>${esc(line)}</li>`).join('');
}

function openPromoForm(promo = null) {
    const p = promo || { discountType: 'amount', active: true, daysOfWeek: [], totalLimit: 0 };
    const days = new Set(p.daysOfWeek || []);
    const PF_TABS = [['code', 'sell', 'โค้ดและส่วนลด'], ['when', 'event', 'ใช้ได้เมื่อไร'], ['limit', 'tune', 'สิทธิ์และสถานะ']];
    openModal(promo ? promo.code : 'สร้างโค้ดส่วนลดใหม่', `<form id="promo-form" class="mf" novalidate>
        <div class="mf-tabs" role="tablist" aria-label="ส่วนของฟอร์ม">
            ${PF_TABS.map(([key, iconName, text], index) => `<button type="button" role="tab" id="pf-tab-${key}" data-pf-tab="${key}" aria-controls="pf-pane-${key}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${icon(iconName)}<span>${text}</span><i class="mf-dot" aria-hidden="true"></i></button>`).join('')}
        </div>
        <div class="mf-layout">
            <div class="mf-main">
                <section class="mf-pane space-y-6" role="tabpanel" id="pf-pane-code" aria-labelledby="pf-tab-code">
                    <div><label class="label" for="pf-code">โค้ด <span class="text-rose-600">*</span></label>
                        <div class="flex gap-2 max-w-sm">
                            <input class="field font-mono uppercase" id="pf-code" value="${esc(p.code || '')}" ${promo ? 'readonly' : ''} maxlength="20" placeholder="เช่น STUDENT50" autocomplete="off">
                            ${promo ? '' : `<button class="btn btn-ghost" id="pf-random" type="button" title="สุ่มโค้ด">${icon('casino')}สุ่ม</button>`}
                        </div>
                        <p class="hint">${promo ? 'แก้ไขโค้ดไม่ได้หลังสร้างแล้ว' : 'ภาษาอังกฤษตัวใหญ่หรือตัวเลข 3–20 ตัว'}</p></div>
                    <div><label class="label" for="pf-description">คำอธิบาย</label>
                        <input class="field max-w-md" id="pf-description" value="${esc(p.description || '')}" placeholder="เช่น ส่วนลดนักศึกษา" maxlength="200"></div>
                    <div class="grid sm:grid-cols-2 gap-4">
                        <div><span class="label">ลดเป็น</span>
                            <div class="segmented" id="pf-type" role="group" aria-label="ประเภทส่วนลด">
                                <button type="button" data-value="amount" aria-pressed="${p.discountType !== 'percent'}">จำนวนเงิน (บาท)</button>
                                <button type="button" data-value="percent" aria-pressed="${p.discountType === 'percent'}">เปอร์เซ็นต์ (%)</button>
                            </div></div>
                        <div><label class="label" for="pf-value">มูลค่าส่วนลด <span class="text-rose-600">*</span></label>
                            <div class="affix"><input class="field" id="pf-value" type="number" inputmode="numeric" min="1" value="${esc(p.discountValue || '')}" placeholder="100"><span id="pf-unit">${p.discountType === 'percent' ? '%' : 'บาท'}</span></div></div>
                    </div>
                </section>
                <section class="mf-pane space-y-6 hidden" role="tabpanel" id="pf-pane-when" aria-labelledby="pf-tab-when">
                    <div><span class="label">วันในสัปดาห์</span>
                        <div class="flex flex-wrap gap-2" id="pf-presets">${DAY_PRESETS.map(([label]) => `<button class="chip" type="button" data-preset="${label}">${label}</button>`).join('')}</div>
                        <div class="pf-days" id="pf-days" role="group" aria-label="วันในสัปดาห์">
                            ${DAY_NAMES.map((day, index) => `<button type="button" data-day="${index}" aria-pressed="${days.has(index)}" title="${DAY_FULL[index]}">${day}</button>`).join('')}
                        </div>
                        <p class="hint">ไม่เลือกวันไหนเลย = ใช้ได้ทุกวัน</p></div>
                    <div class="grid grid-cols-2 gap-3 max-w-md">
                        <div><label class="label" for="pf-start">เริ่มใช้ได้</label><input class="field" id="pf-start" type="date" value="${esc(p.startDate || '')}"><p class="hint">เว้นว่าง = ใช้ได้ทันที</p></div>
                        <div><label class="label" for="pf-end">หมดอายุ</label><input class="field" id="pf-end" type="date" value="${esc(p.endDate || '')}"><p class="hint">เว้นว่าง = ไม่มีวันหมดอายุ</p></div>
                    </div>
                </section>
                <section class="mf-pane space-y-6 hidden" role="tabpanel" id="pf-pane-limit" aria-labelledby="pf-tab-limit">
                    <div><label class="label" for="pf-limit">จำนวนสิทธิ์ทั้งหมด</label>
                        <div class="affix" style="max-width:12rem"><input class="field" id="pf-limit" type="number" inputmode="numeric" min="0" value="${esc(p.totalLimit || '')}" placeholder="ไม่จำกัด"><span>สิทธิ์</span></div>
                        <p class="hint">เว้นว่างหรือ 0 = ไม่จำกัด • 1 บัญชีใช้ได้ 1 ครั้ง${promo ? ` • ใช้ไปแล้ว ${promo.usedCount || 0} ครั้ง` : ''}</p></div>
                    <div><span class="label">สถานะ</span>
                        <div class="switch-row">
                            <button class="switch" id="pf-active" role="switch" type="button" aria-checked="${p.active !== false}" aria-label="เปิดใช้โค้ดนี้"></button>
                            <div><b id="pf-active-text"></b><small id="pf-active-sub"></small></div>
                        </div></div>
                </section>
            </div>
            <aside class="mf-preview" id="pf-preview" aria-label="ตัวอย่างคูปอง">
                <p class="mf-preview-label">${icon('visibility')}ตัวอย่างคูปอง</p>
                <article class="card coupon pv-coupon" id="pf-coupon"></article>
                <p class="mf-preview-label mt-5">${icon('calculate')}ตัวอย่างการคิดเงิน</p>
                <div class="pf-calc" id="pf-calc"></div>
                <p class="mf-preview-label mt-5">${icon('checklist')}สรุปเงื่อนไข</p>
                <ul class="pf-rules" id="pf-summary"></ul>
            </aside>
        </div>
        <div class="modal-actions mf-actions">
            <button class="btn btn-ghost btn-sm mf-preview-toggle" type="button" id="pf-preview-toggle" aria-expanded="false" aria-controls="pf-preview">${icon('visibility')}ตัวอย่าง</button>
            <span class="mf-keyhint"></span>
            <button class="btn btn-ghost" type="button" data-close-modal>ยกเลิก</button>
            <button class="btn btn-primary" type="submit">${icon('save')}${promo ? 'บันทึกการแก้ไข' : 'สร้างโค้ด'}</button>
        </div>
    </form>`, { wide: true, sub: promo ? `แก้ไขโค้ดส่วนลด${promo.description ? ` • ${promo.description}` : ''}` : 'กำหนดส่วนลดและเงื่อนไข แล้วกดสร้างโค้ด' });
    const form = $('#promo-form');
    form.querySelector('[data-close-modal]').addEventListener('click', closeModal);

    // tabs
    const pfTabs = [...form.querySelectorAll('[data-pf-tab]')];
    const showPfTab = (key, focus = false) => {
        pfTabs.forEach((tab) => {
            const on = tab.dataset.pfTab === key;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            $(`#pf-pane-${tab.dataset.pfTab}`).classList.toggle('hidden', !on);
            if (on && focus) tab.focus();
        });
        form.querySelector('.mf-main').scrollTop = 0;
    };
    form.querySelector('.mf-tabs').addEventListener('click', (event) => {
        const tab = event.target.closest('[data-pf-tab]');
        if (tab) showPfTab(tab.dataset.pfTab);
    });
    form.querySelector('.mf-tabs').addEventListener('keydown', (event) => {
        const index = pfTabs.indexOf(document.activeElement);
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1 }[event.key];
        if (index < 0 || next === undefined) return;
        event.preventDefault();
        showPfTab(pfTabs[(next + pfTabs.length) % pfTabs.length].dataset.pfTab, true);
    });
    form.addEventListener('input', (event) => {
        if (!event.target.classList.contains('invalid')) return;
        event.target.classList.remove('invalid');
        event.target.removeAttribute('aria-invalid');
        const holder = event.target.closest('.affix, .flex')?.parentElement || event.target.parentElement;
        holder.querySelector('.field-error')?.remove();
        pfTabs.forEach((tab) => tab.classList.toggle('has-error', Boolean($(`#pf-pane-${tab.dataset.pfTab}`).querySelector('.invalid'))));
    });
    $('#pf-preview-toggle').addEventListener('click', () => {
        const open = $('#pf-preview').classList.toggle('open');
        $('#pf-preview-toggle').setAttribute('aria-expanded', String(open));
        $('#pf-preview-toggle').innerHTML = `${icon(open ? 'visibility_off' : 'visibility')}${open ? 'ซ่อนตัวอย่าง' : 'ตัวอย่าง'}`;
    });

    const read = () => ({
        usedCount: promo?.usedCount || 0,
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
        $('#pf-unit').textContent = data.discountType === 'percent' ? '%' : 'บาท';
        $('#pf-active-text').textContent = data.active ? 'เปิดใช้งาน' : 'ปิดอยู่';
        $('#pf-active-sub').textContent = data.active ? 'ลูกค้าใช้โค้ดนี้ได้' : 'ลูกค้าจะใช้โค้ดนี้ไม่ได้';
        renderPromoPreview(data);
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
    $('#pf-random')?.addEventListener('click', () => { $('#pf-code').value = randomPromoCode(); refresh(); });
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
        const { usedCount: _used, ...body } = read(); // usedCount is display-only
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
        pfTabs.forEach((tab) => tab.classList.toggle('has-error', Boolean($(`#pf-pane-${tab.dataset.pfTab}`).querySelector('.invalid'))));
        if (firstInvalid) {
            showPfTab(firstInvalid.closest('.mf-pane').id.replace('pf-pane-', ''));
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
        const ok = await confirmDialog({ title: `ลบโค้ด ${deleteCode}?`, message: 'ลูกค้าจะใช้โค้ดนี้ไม่ได้อีก (การจองที่ใช้โค้ดไปแล้วไม่เปลี่ยน)', confirmText: 'ลบโค้ด', danger: true });
        if (!ok) return;
        const result = await withButton(event.target, () => api.request(`/api/admin/promotions/${encodeURIComponent(deleteCode)}`, { method: 'DELETE' }));
        if (!result) return;
        toast(result.message || 'ลบโค้ดแล้ว');
        loadPromotions();
    }
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
let usersCache = [];
function renderUsers() {
    const keyword = $('#user-search').value.trim().toLowerCase();
    const users = usersCache.filter((u) => !keyword || `${u.email} ${u.displayName}`.toLowerCase().includes(keyword))
        .sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1));
    const nameOf = (u) => (u.displayName && u.displayName !== 'ผู้ใช้' ? u.displayName : (u.email || '-').split('@')[0]);
    const pg = paginate('users', users);
    $('#users-table').innerHTML = tableBox(`<table class="table">
        <thead><tr><th>ผู้ใช้</th><th class="num">คะแนนสะสม</th><th>สมัครเมื่อ</th><th>สิทธิ์</th><th></th></tr></thead>
        <tbody>${pg.rows.length ? pg.rows.map((u) => `<tr>
            <td><div class="flex items-center gap-3 min-w-0"><span class="avatar" ${u.role === 'admin' ? 'style="background:var(--ink);color:#fff"' : ''}>${initial(nameOf(u))}</span>
                <div class="min-w-0"><p class="cell-title truncate">${esc(nameOf(u))}</p><p class="cell-sub truncate">${esc(u.email || '-')}</p></div></div></td>
            <td class="num font-semibold">${Number(u.loyaltyPoints || 0).toLocaleString('th-TH')}</td>
            <td class="cell-sub whitespace-nowrap">${esc(dateTimeTh(u.createdAt))}</td>
            <td>${u.role === 'admin' ? badge('ผู้ดูแลระบบ', 'tone-violet') : badge('ลูกค้า', 'bg-slate-100 text-slate-600')}</td>
            <td><div class="row-actions">${u.uid === me?.uid ? '<span class="pill plain" style="background:var(--surface-2);color:var(--muted)">บัญชีของคุณ</span>' : `<button class="btn ${u.role === 'admin' ? 'btn-danger' : 'btn-ghost'} btn-sm" data-role-uid="${esc(u.uid)}" data-role="${u.role === 'admin' ? 'customer' : 'admin'}" data-email="${esc(u.email || '')}" type="button">${icon(u.role === 'admin' ? 'remove_moderator' : 'shield_person')}${u.role === 'admin' ? 'ถอนสิทธิ์' : 'ให้สิทธิ์แอดมิน'}</button>`}</div></td>
        </tr>`).join('') : emptyRow(keyword ? 'ไม่พบผู้ใช้ที่ค้นหา' : 'ยังไม่มีผู้ใช้', 5, 'group')}</tbody></table>`, pg.pager);
}

async function loadUsers() {
    loading($('#users-table'));
    try {
        usersCache = await api.request('/api/admin/users');
        resetPage('users');
    } catch (error) {
        toast(error.message, 'error');
        return;
    }
    renderUsers();
}
$('#user-search').addEventListener('input', () => { resetPage('users'); renderUsers(); });
pageRenderers.users = renderUsers;

$('#users-table').addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-role-uid]');
    if (!btn) return;
    const toAdmin = btn.dataset.role === 'admin';
    const ok = await confirmDialog({
        title: toAdmin ? 'ให้สิทธิ์ผู้ดูแลระบบ?' : 'ถอนสิทธิ์ผู้ดูแลระบบ?',
        message: `${btn.dataset.email}\n${toAdmin ? 'ผู้ใช้นี้จะเข้าหน้าหลังบ้านและแก้ไขข้อมูลทั้งหมดได้' : 'ผู้ใช้นี้จะเข้าหน้าหลังบ้านไม่ได้อีก'}`,
        confirmText: toAdmin ? 'ให้สิทธิ์' : 'ถอนสิทธิ์',
        danger: !toAdmin,
        iconName: toAdmin ? 'shield_person' : 'remove_moderator'
    });
    if (!ok) return;
    const result = await withButton(btn, () => api.request(`/api/admin/users/${encodeURIComponent(btn.dataset.roleUid)}/role`, { method: 'PUT', body: { role: btn.dataset.role } }));
    if (!result) return;
    toast('อัปเดตสิทธิ์แล้ว');
    loadUsers();
});
