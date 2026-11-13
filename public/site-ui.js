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

    // ------------------------------------------------------------------ shared header / footer / login
    const NAV = [
        ['home', 'index.html', 'หน้าแรก'],
        ['movies', 'movies.html', 'ภาพยนตร์'],
        ['cinemas', 'cinemas.html', 'โรงภาพยนตร์'],
        ['promotions', 'promotions.html', 'โปรโมชั่น']
    ];
    const STEPS = ['เลือกรอบ', 'เลือกที่นั่ง', 'ชำระเงิน', 'รับตั๋ว'];
    const ic = (name) => `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
    const logo = '<a class="sh-logo" href="index.html" aria-label="Cinema หน้าแรก"><span class="sh-mark">' + ic('theaters') + '</span><b>Cinema</b></a>';

    const AUTH_UI = `
<div id="auth-backdrop" class="fixed inset-0 hidden transition-all duration-300" style="pointer-events:none"></div>
<div id="auth-modal" class="fixed inset-0 hidden flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="auth-card">
    <div class="auth-top">
      <span class="sh-mark">${ic('theaters')}</span>
      <h2 id="modal-title">ยินดีต้อนรับสู่ Cinema</h2>
      <p>เข้าสู่ระบบเพื่อจองตั๋ว สะสมคะแนน และดูตั๋วของคุณ</p>
      <button id="modal-close-btn" type="button" aria-label="ปิด">${ic('close')}</button>
    </div>
    <div class="auth-body">
      <div class="auth-tabs" role="tablist">
        <button class="auth-tab-btn active" data-tab="login" type="button">เข้าสู่ระบบ</button>
        <button class="auth-tab-btn" data-tab="signup" type="button">สมัครสมาชิก</button>
      </div>
      <form id="login-form" class="space-y-4" novalidate>
        <label class="auth-field"><span>อีเมล</span><span class="auth-input">${ic('mail')}<input id="login-email" type="email" autocomplete="username" placeholder="you@example.com" required></span></label>
        <label class="auth-field"><span>รหัสผ่าน</span><span class="auth-input">${ic('lock')}<input id="login-password" type="password" autocomplete="current-password" placeholder="••••••••" required></span></label>
        <p class="auth-error" id="login-error"></p>
        <button type="submit" class="ui-btn ui-btn-primary w-full">เข้าสู่ระบบ</button>
      </form>
      <form id="signup-form" class="space-y-4 hidden" novalidate>
        <label class="auth-field"><span>ชื่อที่ใช้แสดง</span><span class="auth-input">${ic('badge')}<input id="signup-nickname" type="text" autocomplete="nickname" placeholder="ชื่อของคุณ" required></span></label>
        <label class="auth-field"><span>อีเมล</span><span class="auth-input">${ic('mail')}<input id="signup-email" type="email" autocomplete="email" placeholder="you@example.com" required></span></label>
        <div class="grid grid-cols-2 gap-3">
          <label class="auth-field"><span>รหัสผ่าน</span><span class="auth-input">${ic('lock')}<input id="signup-password" type="password" autocomplete="new-password" placeholder="6 ตัวขึ้นไป" required></span></label>
          <label class="auth-field"><span>ยืนยันรหัสผ่าน</span><span class="auth-input">${ic('lock')}<input id="signup-confirm-password" type="password" autocomplete="new-password" placeholder="อีกครั้ง" required></span></label>
        </div>
        <p class="auth-error" id="signup-error"></p>
        <button type="submit" class="ui-btn ui-btn-primary w-full">สมัครสมาชิก รับ 250 คะแนน</button>
      </form>
    </div>
  </div>
</div>`;

    /**
     * Render the shared site header into <header id="site-header">.
     *   active: 'home' | 'movies' | 'cinemas' | 'promotions' | 'account'
     *   search: { id, placeholder } — keeps the id the page script listens to; omitted → searches movies.html
     *   step:   1-4 for the booking flow (shows progress instead of the menu)
     *   back:   true → back button (history)
     *   timer:  true → seat-hold countdown (#checkout-timer)
     *   hidden: ids of legacy elements page scripts still write to
     */
    function header(options = {}) {
        const el = document.getElementById('site-header');
        if (!el) return;
        const { active = '', search = null, step = 0, back = false, timer = false, hidden = [] } = options;
        el.className = 'sh';
        const searchBox = step ? '' : `<form class="sh-search" role="search" data-site-search="${search ? '' : 'global'}">
            ${ic('search')}<input id="${search?.id || 'site-search-input'}" type="search" placeholder="${search?.placeholder || 'ค้นหาภาพยนตร์'}" aria-label="ค้นหา" autocomplete="off">
        </form>`;
        const middle = step
            ? `<nav class="sh-steps" aria-label="ขั้นตอนการจอง">${STEPS.map((label, i) => {
                const n = i + 1;
                const state = n < step ? 'done' : n === step ? 'now' : '';
                return `${i ? '<span class="sh-step-line"></span>' : ''}<span class="sh-step ${state}" ${n === step ? 'aria-current="step"' : ''}><i>${n < step ? '✓' : n}</i>${label}</span>`;
            }).join('')}</nav>`
            : `<nav class="sh-nav" aria-label="เมนูหลัก">${NAV.map(([key, href, label]) => `<a href="${href}" class="${key === active ? 'active' : ''}" ${key === active ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
        el.innerHTML = `<div class="sh-in">
            ${back ? `<a class="sh-back" href="index.html" data-back aria-label="ย้อนกลับ">${ic('arrow_back')}</a>` : ''}
            ${logo}
            ${middle}
            <div class="sh-right">
                ${searchBox}
                ${timer ? `<div class="sh-timer" title="เวลาที่ล็อกที่นั่งไว้ให้">${ic('timer')}<span id="checkout-timer">--:--</span></div>` : ''}
                ${step ? '' : `<span class="sh-points" id="sh-points">${ic('stars')}<span id="member-points">0 คะแนน</span></span>`}
                <div class="sh-account">
                    <button id="profile-btn" class="sh-profile is-guest" type="button">${ic('login')}<span>เข้าสู่ระบบ</span></button>
                    <div id="profile-menu" class="sh-menu hidden" role="menu">
                        <div class="sh-menu-head"><b id="user-name">ผู้ใช้</b><small id="user-email"></small></div>
                        <a href="user.html" role="menuitem">${ic('person')}บัญชีของฉัน</a>
                        <a href="user.html#history" role="menuitem">${ic('confirmation_number')}ตั๋วของฉัน</a>
                        <a href="admin.html" role="menuitem" id="menu-admin" class="hidden">${ic('admin_panel_settings')}ระบบหลังบ้าน</a>
                        <button id="logout-btn" type="button" role="menuitem">${ic('logout')}ออกจากระบบ</button>
                    </div>
                </div>
                ${hidden.map((id) => `<span id="${id}" hidden></span>`).join('')}
            </div>
        </div>
        ${step ? `<div class="flow-mini">ขั้นตอน <b>${step}/4</b> • ${STEPS[step - 1]}</div>` : ''}`;

        el.querySelector('[data-back]')?.addEventListener('click', (event) => {
            if (history.length > 1) { event.preventDefault(); history.back(); }
        });
        const globalSearch = el.querySelector('[data-site-search="global"]');
        globalSearch?.addEventListener('submit', (event) => {
            event.preventDefault();
            const q = globalSearch.querySelector('input').value.trim();
            window.location.href = `movies.html${q ? `?q=${encodeURIComponent(q)}` : ''}`;
        });
        el.querySelector('.sh-search:not([data-site-search="global"])')?.addEventListener('submit', (event) => event.preventDefault());
        // Pages without the login module: the account button just opens the account page.
        el.querySelector('#profile-btn').addEventListener('click', () => {
            if (!window.authModule?.openAuthModal) window.location.href = 'user.html';
        });
        window.addEventListener('scroll', () => el.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
        if (!document.getElementById('auth-modal')) document.body.insertAdjacentHTML('beforeend', AUTH_UI);
    }

    function footer() {
        const el = document.getElementById('site-footer');
        if (!el) return;
        el.className = 'sf';
        el.innerHTML = `<div class="sf-in">
            <div class="sf-grid">
                <div class="sf-brand">${logo}<p>จองตั๋วหนังออนไลน์ เลือกรอบ เลือกที่นั่ง จ่ายเงิน และรับตั๋ว QR ได้ในไม่กี่ขั้นตอน</p></div>
                <div><h5>ภาพยนตร์</h5><ul>
                    <li><a href="movies.html">กำลังฉาย</a></li><li><a href="index.html#coming-soon">โปรแกรมหน้า</a></li>
                    <li><a href="cinemas.html">โรงภาพยนตร์</a></li><li><a href="promotions.html">โปรโมชั่น</a></li></ul></div>
                <div><h5>สมาชิก</h5><ul>
                    <li><a href="user.html">บัญชีของฉัน</a></li><li><a href="user.html#history">ตั๋วของฉัน</a></li>
                    <li><a href="membership.html">สิทธิพิเศษสมาชิก</a></li><li><a href="faq.html">คำถามที่พบบ่อย</a></li></ul></div>
                <div><h5>เกี่ยวกับเรา</h5><ul>
                    <li><a href="about.html">เกี่ยวกับ Cinema</a></li><li><a href="contact.html">ติดต่อเรา</a></li>
                    <li><a href="terms-of-service.html">ข้อตกลงการใช้งาน</a></li><li><a href="privacy-policy.html">นโยบายความเป็นส่วนตัว</a></li></ul></div>
            </div>
            <div class="sf-bottom"><span>© 2026 Cinema Booking</span><span>งานรายวิชา 02739322 • ข้อมูลในระบบเป็นข้อมูลสมมุติ</span></div>
        </div>`;
    }

    window.cinemaUi = { toast, header, footer };
})();
