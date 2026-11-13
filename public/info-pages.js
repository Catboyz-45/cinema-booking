// Shared helpers for the information pages (about, contact, FAQ, membership, terms, privacy).
// - Numbers such as prices, seat-hold minutes and loyalty points come live from /api/pricing,
//   so the pages stay correct when the admin changes the settings.
//   Usage: <b data-fill="loyalty.signupBonus" data-format="number">250</b>
// - Legal pages: highlights the current section in the table of contents.
(() => {
    const CONTACT = {
        phone: '02-029-9999',
        email: 'support@cinema.local',
        hours: 'ทุกวัน 10:00–22:00 น.'
    };

    const DEFAULT_PRICING = {
        seatPrices: { 'Sofa Pair': 500, Premium: 350, Regular: 240 },
        serviceFeePerSeat: 20,
        holdMinutes: 12,
        loyalty: { signupBonus: 250, pointsRequired: 80, pointDiscount: 30, pointsEarnedPerBooking: 50 }
    };

    let pricingPromise = null;
    function pricing() {
        if (!pricingPromise) {
            pricingPromise = window.cinemaApi.request('/api/pricing', { auth: false })
                .then((data) => ({ ...DEFAULT_PRICING, ...data, loyalty: { ...DEFAULT_PRICING.loyalty, ...(data?.loyalty || {}) } }))
                .catch(() => DEFAULT_PRICING);
        }
        return pricingPromise;
    }

    const pick = (object, path) => path.split('.').reduce((value, key) => (value == null ? value : value[key]), object);
    const formatValue = (value, format) => {
        const number = Number(value);
        if (format === 'money') return `฿${number.toLocaleString('th-TH')}`;
        if (format === 'number') return number.toLocaleString('th-TH');
        return String(value);
    };

    async function fillPricing(root = document) {
        const data = await pricing();
        root.querySelectorAll('[data-fill]').forEach((el) => {
            const value = pick(data, el.dataset.fill);
            if (value !== undefined && value !== null) el.textContent = formatValue(value, el.dataset.format);
        });
        root.querySelectorAll('[data-contact]').forEach((el) => {
            const value = CONTACT[el.dataset.contact];
            if (!value) return;
            el.textContent = value;
            if (el.tagName === 'A') el.href = el.dataset.contact === 'phone' ? `tel:${value.replace(/[^0-9+]/g, '')}` : `mailto:${value}`;
        });
        return data;
    }

    function tableOfContents() {
        const links = [...document.querySelectorAll('.toc a[href^="#"]')];
        const sections = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
        if (!sections.length) return;
        // the current section is the last one whose heading has scrolled past the sticky header
        const update = () => {
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
            let current = sections[0];
            for (const section of sections) if (section.getBoundingClientRect().top <= 140) current = section;
            if (atBottom) current = sections[sections.length - 1];
            links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current.id}`));
        };
        window.addEventListener('scroll', update, { passive: true });
        update();
    }

    window.cinemaInfo = { CONTACT, pricing, fillPricing };
    document.addEventListener('DOMContentLoaded', () => {
        fillPricing();
        tableOfContents();
    });
})();
