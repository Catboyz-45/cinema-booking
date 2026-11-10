// Shared UI helpers for the customer pages (classic script, load after cinema-api.js).
//  - toast notifications instead of blocking alert() popups (messages survive a redirect)
//  - bottom navigation bar on phones
(function () {
    const FLASH_KEY = 'cinema.flash';
    const NAV_ITEMS = [
        { href: 'index.html', icon: 'home', label: 'หน้าแรก', match: ['', 'index.html'] },
        { href: 'movies.html', icon: 'movie', label: 'ภาพยนตร์', match: ['movies.html', 'movie-details.html'] },
        { href: 'cinemas.html', icon: 'location_on', label: 'โรงภาพยนตร์', match: ['cinemas.html'] },
        { href: 'promotions.html', icon: 'sell', label: 'โปรโมชั่น', match: ['promotions.html'] },
        { href: 'user.html', icon: 'person', label: 'บัญชี', match: ['user.html', 'booking-confirmation.html'], account: true }
    ];

    const style = document.createElement('style');
    style.textContent = `
        .cx-toasts { position: fixed; z-index: 9999; top: 16px; left: 16px; right: 16px; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
        @media (min-width: 768px) { .cx-toasts { left: auto; width: 380px; } }
        .cx-toast { pointer-events: auto; display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px;
            background: #0f172a; color: #fff; font: 600 14px/1.45 'Inter', 'Noto Sans Thai', sans-serif; box-shadow: 0 10px 30px rgba(15, 23, 42, .25);
            opacity: 0; transform: translateY(-8px); transition: opacity .2s, transform .2s; }
        .cx-toast.show { opacity: 1; transform: none; }
        .cx-toast.error { background: #be123c; }
        .cx-toast.success { background: #047857; }
        .cx-toast button { margin-left: auto; background: none; border: 0; color: inherit; opacity: .7; cursor: pointer; font-size: 18px; line-height: 1; }
        .cx-bottom-nav { position: fixed; z-index: 45; left: 0; right: 0; bottom: 0; display: flex; background: rgba(255, 255, 255, .97);
            border-top: 1px solid #e2e8f0; padding-bottom: env(safe-area-inset-bottom); backdrop-filter: blur(8px); }
        .cx-bottom-nav a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 6px;
            color: #64748b; font: 600 11px/1.2 'Inter', 'Noto Sans Thai', sans-serif; text-decoration: none; }
        .cx-bottom-nav a.active { color: #e9508c; }
        .cx-bottom-nav .material-symbols-outlined { font-size: 24px; }
        .cx-bottom-nav a.active .material-symbols-outlined { font-variation-settings: 'FILL' 1; }
        @media (min-width: 768px) { .cx-bottom-nav { display: none; } }
        @media (max-width: 767px) { body.cx-has-bottom-nav { padding-bottom: calc(64px + env(safe-area-inset-bottom)); } }
    `;
    document.head.appendChild(style);

    function container() {
        let el = document.querySelector('.cx-toasts');
        if (!el) {
            el = document.createElement('div');
            el.className = 'cx-toasts';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        return el;
    }

    function guessType(message) {
        if (/ไม่|ผิดพลาด|หมดเวลา|กรุณา|ขัดข้อง|ถูกจอง|ใช้ไปแล้ว|ยกเลิก/.test(message)) return 'error';
        if (/สำเร็จ|เรียบร้อย|แล้ว$/.test(message)) return 'success';
        return 'info';
    }

    function toast(message, type) {
        const text = String(message ?? '');
        if (!text) return;
        const show = () => {
            const el = document.createElement('div');
            el.className = `cx-toast ${type || guessType(text)}`;
            const span = document.createElement('span');
            span.textContent = text;
            const close = document.createElement('button');
            close.type = 'button';
            close.setAttribute('aria-label', 'ปิด');
            close.textContent = '×';
            close.addEventListener('click', () => el.remove());
            el.append(span, close);
            container().appendChild(el);
            requestAnimationFrame(() => el.classList.add('show'));
            setTimeout(() => {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 250);
            }, 5000);
        };
        if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
    }

    // alert() blocks the page and looks like an error dialog; show a toast instead.
    // The message is kept for a few seconds so it still appears if the page redirects right after.
    window.alert = (message) => {
        toast(message);
        try {
            sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message: String(message), at: Date.now(), page: location.pathname + location.search }));
        } catch (_error) {
        }
    };

    function showFlash() {
        try {
            const flash = JSON.parse(sessionStorage.getItem(FLASH_KEY) || 'null');
            sessionStorage.removeItem(FLASH_KEY);
            if (flash && Date.now() - flash.at < 8000 && flash.page !== location.pathname + location.search) toast(flash.message);
        } catch (_error) {
        }
    }

    function bottomNav() {
        if (document.body.dataset.noBottomNav !== undefined) return;
        const page = location.pathname.split('/').pop();
        const nav = document.createElement('nav');
        nav.className = 'cx-bottom-nav';
        nav.setAttribute('aria-label', 'เมนูหลัก');
        nav.innerHTML = NAV_ITEMS.map((item) => `
            <a href="${item.href}" class="${item.match.includes(page) ? 'active' : ''}" ${item.account ? 'data-account-link' : ''} ${item.match.includes(page) ? 'aria-current="page"' : ''}>
                <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>${item.label}
            </a>`).join('');
        nav.querySelector('[data-account-link]').addEventListener('click', (event) => {
            if (window.authModule?.isLoggedIn && !window.authModule.isLoggedIn() && window.authModule.openAuthModal) {
                event.preventDefault();
                window.authModule.openAuthModal();
            }
        });
        document.body.appendChild(nav);
        document.body.classList.add('cx-has-bottom-nav');
    }

    document.addEventListener('DOMContentLoaded', () => {
        showFlash();
        bottomNav();
    });

    window.cinemaUi = { toast };
})();
