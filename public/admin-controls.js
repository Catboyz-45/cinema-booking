// Custom form controls for the admin pages (classic script, load before admin.js).
// Every <select class="field">, <input type="date" class="field"> and <input type="time" class="field">
// is enhanced automatically — also those added later (modal forms). The native element stays in the
// DOM (visually hidden) so existing code can keep reading/writing .value and listening for "change".
(function () {
    const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const DAYS_MINI = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

    const pad = (n) => String(n).padStart(2, '0');
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const parseIso = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) } : null);
    const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const addDaysIso = (s, n) => {
        const p = parseIso(s);
        const date = new Date(Date.UTC(p.y, p.m, p.d + n));
        return date.toISOString().slice(0, 10);
    };
    const thaiDate = (s) => {
        const p = parseIso(s);
        if (!p) return '';
        const weekday = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
        return `${DAYS[weekday]} ${p.d} ${MONTHS_SHORT[p.m]} ${p.y + 543}`;
    };
    const icon = (name, cls = '') => `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${name}</span>`;

    // ---------------------------------------------------------------- popover
    let current = null; // { el, anchor, place, close }

    function closePopover() {
        if (!current) return;
        const pop = current;
        current = null;
        pop.close();
    }

    function openPopover(anchor, className, { onClose } = {}) {
        closePopover();
        const el = document.createElement('div');
        el.className = `cx-pop ${className}`;
        document.body.appendChild(el);
        const place = () => {
            const r = anchor.getBoundingClientRect();
            el.style.minWidth = className === 'cx-list' ? `${Math.max(200, r.width)}px` : '';
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
            let top = r.bottom + 6;
            if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
            if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
        };
        anchor.setAttribute('aria-expanded', 'true');
        anchor.classList.add('cx-open');
        current = {
            el,
            anchor,
            place,
            close: () => {
                el.remove();
                anchor.setAttribute('aria-expanded', 'false');
                anchor.classList.remove('cx-open');
                onClose?.();
            }
        };
        return current;
    }

    document.addEventListener('mousedown', (event) => {
        if (current && !current.el.contains(event.target) && !current.anchor.contains(event.target)) closePopover();
    }, true);
    document.addEventListener('scroll', (event) => {
        if (current && !current.el.contains(event.target)) current.place();
    }, true);
    window.addEventListener('resize', closePopover);

    // ---------------------------------------------------------------- shared wrapper
    function hookValue(el, after) {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        Object.defineProperty(el, 'value', {
            configurable: true,
            get() { return desc.get.call(el); },
            set(v) { desc.set.call(el, v); after(); }
        });
    }

    function labelFor(el) {
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (el.id) {
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label) return label.textContent.replace('*', '').trim();
        }
        return '';
    }

    function wrap(el, kind, leadingIcon) {
        el.dataset.cx = '1';
        const box = document.createElement('div');
        box.className = ['cx-wrap', `cx-${kind}`, ...[...el.classList].filter((c) => !['field', 'invalid', 'cx-native'].includes(c))].join(' ');
        el.parentNode.insertBefore(box, el);
        box.appendChild(el);
        el.classList.add('cx-native');
        el.tabIndex = -1;
        el.setAttribute('aria-hidden', 'true');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'field cx-trigger';
        btn.setAttribute('aria-haspopup', kind === 'select' ? 'listbox' : 'dialog');
        btn.setAttribute('aria-expanded', 'false');
        const name = labelFor(el);
        if (name) btn.setAttribute('aria-label', name);
        btn.innerHTML = `${leadingIcon ? icon(leadingIcon, 'cx-lead') : ''}<span class="cx-text"></span>${icon(kind === 'select' ? 'expand_more' : 'unfold_more', 'cx-caret')}`;
        box.appendChild(btn);
        el.addEventListener('focus', () => btn.focus());
        return btn;
    }

    function mirrorState(el, btn, sync) {
        const update = () => {
            btn.disabled = el.disabled || el.readOnly;
            btn.classList.toggle('invalid', el.classList.contains('invalid'));
            sync();
        };
        new MutationObserver(update).observe(el, { attributes: true, attributeFilter: ['class', 'disabled', 'readonly', 'min', 'max'] });
        hookValue(el, update);
        el.addEventListener('change', update);
        el.addEventListener('input', update);
        update();
    }

    function emit(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ---------------------------------------------------------------- select
    function enhanceSelect(sel) {
        const btn = wrap(sel, 'select');
        const sync = () => {
            const opt = sel.options[sel.selectedIndex];
            btn.querySelector('.cx-text').textContent = opt ? opt.textContent : 'เลือก';
            btn.classList.toggle('cx-placeholder', !opt);
        };
        new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true });
        mirrorState(sel, btn, sync);
        btn.addEventListener('click', () => (current?.anchor === btn ? closePopover() : openSelect(sel, btn)));
        btn.addEventListener('keydown', (event) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                openSelect(sel, btn);
            }
        });
    }

    function openSelect(sel, btn) {
        const options = [...sel.options];
        const searchable = options.length > 8;
        const pop = openPopover(btn, 'cx-list');
        const { el } = pop;
        el.setAttribute('role', 'listbox');
        el.tabIndex = -1;
        el.innerHTML = `${searchable ? `<div class="cx-search">${icon('search')}<input type="text" placeholder="พิมพ์เพื่อค้นหา" aria-label="ค้นหาตัวเลือก"/></div>` : ''}<div class="cx-options"></div>`;
        const list = el.querySelector('.cx-options');
        const search = el.querySelector('.cx-search input');
        let active = sel.selectedIndex;

        const items = () => [...list.querySelectorAll('.cx-option:not(.disabled)')];
        const highlight = (scroll = true) => {
            items().forEach((item) => item.classList.toggle('active', Number(item.dataset.i) === active));
            if (scroll) list.querySelector('.cx-option.active')?.scrollIntoView({ block: 'nearest' });
        };
        const render = (query = '') => {
            const rows = options
                .map((option, i) => ({ option, i }))
                .filter(({ option }) => !query || option.textContent.toLowerCase().includes(query));
            list.innerHTML = rows.length
                ? rows.map(({ option, i }) => `<div role="option" class="cx-option ${option.disabled ? 'disabled' : ''} ${i === sel.selectedIndex ? 'selected' : ''}" data-i="${i}" aria-selected="${i === sel.selectedIndex}">
                    <span>${esc(option.textContent)}</span>${i === sel.selectedIndex ? icon('check', 'cx-check') : ''}</div>`).join('')
                : '<div class="cx-empty">ไม่พบตัวเลือก</div>';
            if (!items().some((item) => Number(item.dataset.i) === active)) active = Number(items()[0]?.dataset.i ?? -1);
            highlight();
        };
        const choose = (i) => {
            if (sel.selectedIndex !== i) {
                sel.selectedIndex = i;
                emit(sel);
            }
            closePopover();
            btn.focus();
        };

        list.addEventListener('mousedown', (event) => event.preventDefault());
        list.addEventListener('click', (event) => {
            const item = event.target.closest('.cx-option:not(.disabled)');
            if (item) choose(Number(item.dataset.i));
        });
        list.addEventListener('mousemove', (event) => {
            const item = event.target.closest('.cx-option:not(.disabled)');
            if (item && Number(item.dataset.i) !== active) {
                active = Number(item.dataset.i);
                highlight(false);
            }
        });
        el.addEventListener('keydown', (event) => {
            const list2 = items();
            let index = list2.findIndex((item) => Number(item.dataset.i) === active);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                index = event.key === 'ArrowDown' ? Math.min(list2.length - 1, index + 1) : Math.max(0, index - 1);
                active = Number(list2[index]?.dataset.i ?? active);
                highlight();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (active >= 0) choose(active);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closePopover();
                btn.focus();
            } else if (event.key === 'Tab') {
                closePopover();
            } else if (!search && event.key.length === 1) {
                const hit = list2.find((item) => item.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()));
                if (hit) { active = Number(hit.dataset.i); highlight(); }
            }
        });
        search?.addEventListener('input', () => render(search.value.trim().toLowerCase()));

        render();
        pop.place();
        (search || el).focus({ preventScroll: true });
        highlight();
    }

    // ---------------------------------------------------------------- date
    function enhanceDate(input) {
        const btn = wrap(input, 'date', 'calendar_today');
        const sync = () => {
            btn.querySelector('.cx-text').textContent = thaiDate(input.value) || 'เลือกวันที่';
            btn.classList.toggle('cx-placeholder', !input.value);
        };
        mirrorState(input, btn, sync);
        btn.addEventListener('click', () => (current?.anchor === btn ? closePopover() : openDate(input, btn)));
        btn.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); openDate(input, btn); }
        });
    }

    function openDate(input, btn) {
        const pop = openPopover(btn, 'cx-cal');
        const { el } = pop;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'เลือกวันที่');
        const today = todayIso();
        let focus = input.value || (input.min && input.min > today ? input.min : today);
        const allowed = (iso) => (!input.min || iso >= input.min) && (!input.max || iso <= input.max);
        let mode = 'days';

        const set = (iso) => {
            input.value = iso;
            emit(input);
            closePopover();
            btn.focus();
        };

        const renderMonths = () => {
            const f = parseIso(focus);
            const value = parseIso(input.value);
            el.innerHTML = `
                <div class="cx-cal-head">
                    <button type="button" class="cx-nav" data-year="-1" aria-label="ปีก่อนหน้า">${icon('chevron_left')}</button>
                    <b>พ.ศ. ${f.y + 543}</b>
                    <button type="button" class="cx-nav" data-year="1" aria-label="ปีถัดไป">${icon('chevron_right')}</button>
                </div>
                <div class="cx-months">${MONTHS_SHORT.map((name, m) => `<button type="button" data-month="${m}"
                    class="${value && value.y === f.y && value.m === m ? 'selected' : ''} ${m === f.m ? 'focus' : ''}">${name}</button>`).join('')}</div>`;
            pop.place();
        };
        const render = () => {
            if (mode === 'months') { renderMonths(); return; }
            const f = parseIso(focus);
            const first = new Date(Date.UTC(f.y, f.m, 1)).getUTCDay();
            const daysInMonth = new Date(Date.UTC(f.y, f.m + 1, 0)).getUTCDate();
            const cells = [];
            for (let i = 0; i < first; i += 1) cells.push('<span></span>');
            for (let d = 1; d <= daysInMonth; d += 1) {
                const iso = isoOf(f.y, f.m, d);
                const cls = ['cx-day', iso === today ? 'today' : '', iso === input.value ? 'selected' : '', iso === focus ? 'focus' : ''].join(' ');
                cells.push(`<button type="button" class="${cls}" data-date="${iso}" ${allowed(iso) ? '' : 'disabled'} tabindex="${iso === focus ? 0 : -1}" aria-label="${thaiDate(iso)}" aria-pressed="${iso === input.value}">${d}</button>`);
            }
            const canClear = !input.required && input.value;
            el.innerHTML = `
                <div class="cx-cal-head">
                    <button type="button" class="cx-nav" data-nav="-1" aria-label="เดือนก่อนหน้า">${icon('chevron_left')}</button>
                    <button type="button" class="cx-title" data-mode title="เลือกเดือนและปี">${MONTHS[f.m]} ${f.y + 543}${icon('expand_more')}</button>
                    <button type="button" class="cx-nav" data-nav="1" aria-label="เดือนถัดไป">${icon('chevron_right')}</button>
                </div>
                <div class="cx-week">${DAYS_MINI.map((d, i) => `<span class="${i === 0 ? 'sun' : ''}">${d}</span>`).join('')}</div>
                <div class="cx-days">${cells.join('')}</div>
                <div class="cx-cal-foot">
                    <button type="button" class="cx-link" data-today ${allowed(today) ? '' : 'disabled'}>วันนี้</button>
                    ${canClear ? '<button type="button" class="cx-link muted" data-clear>ล้างค่า</button>' : ''}
                </div>`;
            pop.place();
        };
        const moveMonth = (delta) => {
            const f = parseIso(focus);
            const days = new Date(Date.UTC(f.y, f.m + delta + 1, 0)).getUTCDate();
            const target = new Date(Date.UTC(f.y, f.m + delta, Math.min(f.d, days)));
            focus = target.toISOString().slice(0, 10);
            render();
        };

        el.addEventListener('click', (event) => {
            const day = event.target.closest('[data-date]');
            const nav = event.target.closest('[data-nav]');
            const year = event.target.closest('[data-year]');
            const month = event.target.closest('[data-month]');
            if (event.target.closest('[data-mode]')) { mode = 'months'; render(); return; }
            if (year) { const f = parseIso(focus); focus = isoOf(f.y + Number(year.dataset.year), f.m, Math.min(f.d, 28)); render(); return; }
            if (month) {
                const f = parseIso(focus);
                const days = new Date(Date.UTC(f.y, Number(month.dataset.month) + 1, 0)).getUTCDate();
                focus = isoOf(f.y, Number(month.dataset.month), Math.min(f.d, days));
                mode = 'days';
                render();
                el.querySelector('.cx-day.focus')?.focus();
                return;
            }
            if (day && !day.disabled) set(day.dataset.date);
            else if (nav) moveMonth(Number(nav.dataset.nav));
            else if (event.target.closest('[data-today]')) set(today);
            else if (event.target.closest('[data-clear]')) set('');
        });
        // re-rendering removes the clicked button; keep focus inside so Escape closes only the picker
        el.tabIndex = -1;
        el.addEventListener('click', () => {
            if (document.body.contains(el) && !el.contains(document.activeElement)) {
                (el.querySelector('.cx-months .focus') || el.querySelector('.cx-day.focus') || el).focus({ preventScroll: true });
            }
        });
        el.addEventListener('keydown', (event) => {
            const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (mode === 'months' && event.key !== 'Escape') return;
            if (steps[event.key] !== undefined) {
                event.preventDefault();
                focus = addDaysIso(focus, steps[event.key]);
                render();
                el.querySelector('.cx-day.focus')?.focus();
            } else if (event.key === 'PageUp' || event.key === 'PageDown') {
                event.preventDefault();
                moveMonth(event.key === 'PageUp' ? -1 : 1);
                el.querySelector('.cx-day.focus')?.focus();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closePopover();
                btn.focus();
            }
        });
        render();
        (el.querySelector('.cx-day.focus') || el.querySelector('.cx-day:not([disabled])'))?.focus({ preventScroll: true });
    }

    // ---------------------------------------------------------------- time
    const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
    const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

    function enhanceTime(input) {
        const btn = wrap(input, 'time', 'schedule');
        const sync = () => {
            btn.querySelector('.cx-text').textContent = input.value ? `${input.value} น.` : 'เลือกเวลา';
            btn.classList.toggle('cx-placeholder', !input.value);
        };
        mirrorState(input, btn, sync);
        btn.addEventListener('click', () => (current?.anchor === btn ? closePopover() : openTime(input, btn)));
    }

    function openTime(input, btn) {
        const pop = openPopover(btn, 'cx-time');
        const { el } = pop;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'เลือกเวลา');
        let [hour, minute] = (input.value || '').split(':');
        const render = () => {
            el.innerHTML = `
                <div class="cx-time-cols">
                    <div><p>ชั่วโมง</p><div class="cx-grid h">${HOURS.map((h) => `<button type="button" data-h="${h}" class="${h === hour ? 'selected' : ''}">${h}</button>`).join('')}</div></div>
                    <div><p>นาที</p><div class="cx-grid m">${MINUTES.map((m) => `<button type="button" data-m="${m}" class="${m === minute ? 'selected' : ''}" ${hour ? '' : 'disabled'}>${m}</button>`).join('')}</div></div>
                </div>
                <p class="cx-time-hint">${hour ? `เลือกนาทีของ ${hour}:__` : 'เลือกชั่วโมงก่อน'}</p>`;
            pop.place();
        };
        el.addEventListener('click', (event) => {
            const h = event.target.closest('[data-h]');
            const m = event.target.closest('[data-m]');
            if (h) {
                hour = h.dataset.h;
                if (minute) { input.value = `${hour}:${minute}`; emit(input); }
                render();
                el.querySelector('[data-m].selected, [data-m]')?.focus();
            }
            if (m && !m.disabled) {
                minute = m.dataset.m;
                input.value = `${hour}:${minute}`;
                emit(input);
                closePopover();
                btn.focus();
            }
        });
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closePopover();
                btn.focus();
            }
        });
        render();
        (el.querySelector('[data-h].selected') || el.querySelector('[data-h="10"]'))?.focus({ preventScroll: true });
        el.querySelector('[data-h].selected')?.scrollIntoView({ block: 'nearest' });
    }

    // ---------------------------------------------------------------- auto-enhance
    const SELECTOR = 'select.field:not([data-cx]), input.field[type="date"]:not([data-cx]), input.field[type="time"]:not([data-cx])';
    function enhance(root) {
        const nodes = root.matches?.(SELECTOR) ? [root] : [];
        nodes.push(...(root.querySelectorAll ? root.querySelectorAll(SELECTOR) : []));
        nodes.forEach((el) => {
            if (el.tagName === 'SELECT') enhanceSelect(el);
            else if (el.type === 'date') enhanceDate(el);
            else enhanceTime(el);
        });
    }

    function start() {
        enhance(document.body);
        new MutationObserver((records) => {
            records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) enhance(node); }));
            if (current && !document.body.contains(current.anchor)) closePopover();
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.cinemaControls = { enhance, close: closePopover };
})();
