// Shared API client (classic script — load it before page scripts).
//   await cinemaApi.request('/api/me')                 → sends the Firebase ID token when signed in
//   await cinemaApi.catalog()                          → movies + dated showtimes from the server
(function () {
    // The API runs on Vercel (api/index.js). Firebase Hosting serves only the pages, so
    // pages opened from *.web.app / *.firebaseapp.com (or file:) call the Vercel URL;
    // the Vercel copy of the site and the local emulators use the same-origin /api.
    const PRODUCTION_API = 'https://cinema-booking-02739322.vercel.app';
    const onFirebaseHosting = /\.(web\.app|firebaseapp\.com)$/.test(window.location.hostname);
    const base = typeof window.CINEMA_API_BASE === 'string'
        ? window.CINEMA_API_BASE
        : (window.location.protocol === 'file:' || onFirebaseHosting ? PRODUCTION_API : '');

    let auth = null;
    let resolveAuthReady;
    const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });
    // If Firebase never loads (offline / blocked), do not hang requests forever.
    setTimeout(() => resolveAuthReady(null), 8000);
    const authListeners = [];

    function attachAuth(authInstance, onAuthStateChanged) {
        auth = authInstance;
        onAuthStateChanged(auth, (user) => {
            resolveAuthReady(user);
            authListeners.forEach((listener) => {
                try { listener(user); } catch (error) { console.error(error); }
            });
        });
    }

    async function currentUser() {
        await authReady;
        return auth ? auth.currentUser : null;
    }

    async function request(path, options = {}) {
        const { method = 'GET', body, auth: sendToken = true } = options;
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (sendToken) {
            const user = await currentUser();
            if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
        }
        const response = await fetch(base + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        let data = null;
        try { data = await response.json(); } catch (_error) { data = null; }
        if (!response.ok) {
            const error = new Error(data?.message || `เกิดข้อผิดพลาด (${response.status})`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    let catalogPromise = null;
    function catalog() {
        if (!catalogPromise) {
            catalogPromise = request('/api/catalog', { auth: false })
                .then((data) => {
                    if (typeof moviesDatabase !== 'undefined' && Array.isArray(data?.movies)) {
                        Object.keys(moviesDatabase).forEach((key) => { delete moviesDatabase[key]; });
                        data.movies.forEach((movie) => { moviesDatabase[movie.id] = movie; });
                    }
                    return data;
                })
                .catch((error) => {
                    console.warn('โหลดรอบฉายจากเซิร์ฟเวอร์ไม่ได้ ใช้ข้อมูลภาพยนตร์สำรอง:', error);
                    // Static fallback data has no real showtime ids, so it cannot be booked.
                    if (typeof moviesDatabase !== 'undefined') {
                        Object.values(moviesDatabase).forEach((movie) => { movie.showtimes = []; });
                    }
                    return null;
                });
        }
        return catalogPromise;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatThaiDate(dateStr, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return String(dateStr || '');
        return new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', ...options }).format(new Date(`${dateStr}T00:00:00Z`));
    }

    const STATUS_LABELS = {
        pending: { text: 'รอชำระเงิน', className: 'bg-amber-100 text-amber-800' },
        paid: { text: 'ชำระแล้ว', className: 'bg-emerald-100 text-emerald-800' },
        used: { text: 'ใช้แล้ว', className: 'bg-slate-200 text-slate-700' },
        cancelled: { text: 'ยกเลิก', className: 'bg-rose-100 text-rose-700' },
        expired: { text: 'หมดเวลา', className: 'bg-slate-100 text-slate-500' }
    };

    function statusBadge(status) {
        const label = STATUS_LABELS[status] || { text: status || '-', className: 'bg-slate-100 text-slate-600' };
        return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold ${label.className}">${escapeHtml(label.text)}</span>`;
    }

    window.cinemaApi = {
        base,
        attachAuth,
        authReady,
        currentUser,
        onAuthChange: (listener) => authListeners.push(listener),
        request,
        catalog,
        escapeHtml,
        formatThaiDate,
        statusBadge,
        STATUS_LABELS
    };
})();
