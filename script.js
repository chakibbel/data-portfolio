/**
 * Portfolio Website — Optimized & Bug-Fixed JavaScript
 *
 * KEY FIXES:
 * 1. CRITICAL: Removed duplicate document.ready block — original ran App.init() AND
 *    initLanguage/initContactForm/etc. independently, causing double event handlers,
 *    double form submissions, double progress bar animations, etc.
 * 2. CRITICAL: Contact form had TWO submit handlers (ContactForm module + initContactForm).
 *    Merged into one authoritative handler.
 * 3. FIX: Progress bar animation relied on broken aria-valuenow fallback (was reading
 *    inline `style.width` of "0" after reset). Now reads from data-width attribute.
 * 4. FIX: Language switcher used confusing dual-element approach (.fr / .en classes).
 *    Replaced with data-fr / data-en attribute pattern — one element, two strings.
 * 5. FIX: i18n key lookup (splitting "nav.home.fr" into keys) tried to navigate a
 *    translation object but the keys included ".fr"/".en" suffixes that didn't exist
 *    in the object — lookup always failed silently. Removed in favour of data attributes.
 * 6. FIX: showFormResult() was called with wrong argument order — (message, type) in
 *    some places and ('success', 'success') literally in others.
 * 7. FIX: AnimatedBackground injected styles on every App.init() call (no real guard).
 * 8. FIX: ResponsiveLayout forced inline font-sizes, fighting CSS media queries.
 *    Removed: CSS media queries are the correct mechanism.
 * 9. FIX: TypographyEffects.typeWriter() runs on every page load, creating a jarring
 *    flash — removed. Title is set statically.
 * 10. FIX: timeline-list items are now rendered dynamically from data-fr/data-en JSON
 *     attributes during language switch, replacing the original broken dual-<ul> approach.
 * 11. FIX: Missing functions referenced in original document.ready
 *     (initBackToTop, protectImages, loadSecureImages, createAnimatedBackground,
 *      animateProgressBars, updateNavbarOnScroll, adjustLayout) are now properly
 *     encapsulated in modules.
 */

(function ($) {
    'use strict';

    /* =========================================================
       CONFIG
    ========================================================= */
    const CONFIG = {
        scrollOffset: 80,
        scrollDuration: 700,
        navbarScrollThreshold: 50,
        backToTopThreshold: 300,
        progressBarDelay: 150,
        animatedBgElements: 15,
        successMsgDuration: 8000,
        errorMsgDuration: 10000
    };

    /* =========================================================
       UTILITIES
    ========================================================= */
    const Utils = {
        throttle(fn, wait) {
            let last = 0, timer;
            return function (...args) {
                const now = Date.now();
                const remaining = wait - (now - last);
                clearTimeout(timer);
                if (remaining <= 0) {
                    fn.apply(this, args);
                    last = now;
                } else {
                    timer = setTimeout(() => { fn.apply(this, args); last = Date.now(); }, remaining);
                }
            };
        },
        debounce(fn, wait) {
            let t;
            return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
        },
        isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }
    };

    /* =========================================================
       LANGUAGE MODULE
       Uses data-fr / data-en attributes on a SINGLE element —
       no duplicate markup, no broken key lookups.
    ========================================================= */
    const Language = {
        current: 'fr',

        init() {
            this.current = localStorage.getItem('portfolioLang') || 'fr';
            this.apply(this.current);

            $('#languageSwitcher').on('click', () => {
                this.current = this.current === 'fr' ? 'en' : 'fr';
                localStorage.setItem('portfolioLang', this.current);
                this.apply(this.current);
            });
        },

        apply(lang) {
            const $html = $('html');
            $html.attr('lang', lang);

            // --- Elements with data-fr / data-en (text content) ---
            // Exclude: elements that use the old class-based show/hide pattern (.brand-title)
            // Exclude: placeholder-only elements (handled separately below)
            // Exclude: elements whose data-fr is used as a data store but not for inner text
            //          (e.g. <ul class="timeline-list"> handled separately below)
            $('[data-fr]')
                .not('[data-placeholder-fr]')
                .not('.brand-title')
                .not('ul.timeline-list')
                .each(function () {
                    const $el = $(this);
                    const text = $el.attr(`data-${lang}`);
                    if (text === undefined || text === null) return;

                    // Preserve a leading <i> icon if present (e.g. highlight-title h4)
                    const $icon = $el.children('i').first().clone();
                    if ($icon.length) {
                        $el.empty().append($icon).append('\u00a0' + text);
                    } else {
                        // Use .html() so &amp; in the attribute becomes & on screen,
                        // but first decode HTML entities from the attribute string
                        const decoded = $('<div>').html(text).text();
                        // Use .text() for plain strings, .html() only if contains tags
                        if (text.includes('<') || text.includes('&')) {
                            $el.html(text);
                        } else {
                            $el.text(decoded);
                        }
                    }
                });

            // --- Placeholder text on form inputs ---
            $('[data-placeholder-fr]').each(function () {
                const $el = $(this);
                $el.attr('placeholder', $el.attr(`data-placeholder-${lang}`));
            });

            // --- Timeline lists (JSON encoded in data attribute) ---
            $('ul.timeline-list').each(function () {
                const $ul = $(this);
                const raw = $ul.attr(`data-${lang}`);
                if (!raw) return;
                try {
                    const items = JSON.parse(raw);
                    $ul.empty();
                    items.forEach(item => $ul.append(`<li>${item}</li>`));
                } catch (e) {
                    console.warn('Could not parse timeline list data:', e);
                }
            });

            // --- Nav brand subtitle (class-based show/hide, not data-attribute pattern) ---
            $('.brand-title.fr').toggle(lang === 'fr');
            $('.brand-title.en').toggle(lang === 'en');

            // --- Language switcher button highlight ---
            $('.lang-fr-label').toggleClass('active', lang === 'fr');
            $('.lang-en-label').toggleClass('active', lang === 'en');

            // --- ARIA label on switcher ---
            $('#languageSwitcher').attr(
                'aria-label',
                lang === 'fr' ? 'Switch language to English' : 'Changer la langue en français'
            );

            // --- Contact form result (if visible) ---
            const $result = $('#form-result');
            if ($result.is(':visible') && $result.data('msg-key')) {
                ContactForm.showStoredMessage(lang);
            }

            // Notify other modules
            $(document).trigger('languageChanged', lang);
        },

        get() { return this.current; }
    };

    /* =========================================================
       NAVIGATION MODULE
    ========================================================= */
    const Navigation = {
        init() {
            this.smoothScroll();
            this.scrollBehavior();
            this.activeLinks();
        },

        smoothScroll() {
            // Delegate on document to catch dynamically generated links too
            $(document).on('click', 'a[href^="#"]', function (e) {
                const hash = this.hash;
                const $target = $(hash);
                if (!$target.length) return;
                e.preventDefault();
                $('html, body').animate(
                    { scrollTop: $target.offset().top - CONFIG.scrollOffset },
                    CONFIG.scrollDuration
                );
                // Close mobile menu if open
                const $navCollapse = $('#navbarNav');
                if ($navCollapse.hasClass('show')) {
                    $navCollapse.collapse('hide');
                }
            });
        },

        scrollBehavior() {
            const $navbar = $('.navbar');
            $(window).on('scroll', Utils.throttle(() => {
                $navbar.toggleClass('navbar-scrolled', $(window).scrollTop() > CONFIG.navbarScrollThreshold);
            }, 100));
        },

        activeLinks() {
            const update = Utils.throttle(() => {
                const scrollPos = $(window).scrollTop() + CONFIG.scrollOffset + 10;
                $('section[id]').each(function () {
                    const top = $(this).offset().top;
                    const bottom = top + $(this).outerHeight();
                    const id = $(this).attr('id');
                    if (scrollPos >= top && scrollPos < bottom) {
                        $('.navbar-nav .nav-link').removeClass('active');
                        $(`.navbar-nav .nav-link[href="#${id}"]`).addClass('active');
                    }
                });
            }, 100);
            $(window).on('scroll', update);
            update();
        }
    };

    /* =========================================================
       ANIMATED BACKGROUND MODULE
    ========================================================= */
    const AnimatedBackground = {
        icons: [
            { cls: 'fas fa-chart-bar',        color: 'rgba(44,193,173,0.25)' },
            { cls: 'fas fa-database',          color: 'rgba(252,85,48,0.25)' },
            { cls: 'fas fa-tachometer-alt',    color: 'rgba(26,16,122,0.3)' },
            { cls: 'fas fa-chart-pie',         color: 'rgba(44,193,173,0.25)' },
            { cls: 'fas fa-code',              color: 'rgba(252,85,48,0.25)' },
            { cls: 'fas fa-project-diagram',   color: 'rgba(26,16,122,0.3)' }
        ],

        init() {
            const $bg = $('.animated-background');
            if (!$bg.length) return;
            $bg.empty();

            const frag = document.createDocumentFragment();
            for (let i = 0; i < CONFIG.animatedBgElements; i++) {
                const icon   = this.icons[Math.floor(Math.random() * this.icons.length)];
                const size   = Math.random() * 60 + 20;
                const div    = document.createElement('div');
                div.className = 'bg-element';
                div.setAttribute('aria-hidden', 'true');
                div.style.cssText = [
                    `left:${(Math.random() * 100).toFixed(1)}%`,
                    `top:${(Math.random() * 100).toFixed(1)}%`,
                    `width:${size}px`,
                    `height:${size}px`,
                    `color:${icon.color}`,
                    `font-size:${(size * 0.6).toFixed(0)}px`,
                    `animation-duration:${(Math.random() * 20 + 10).toFixed(1)}s`,
                    `animation-delay:${(Math.random() * 5).toFixed(1)}s`
                ].join(';');
                div.innerHTML = `<i class="${icon.cls}"></i>`;
                frag.appendChild(div);
            }
            $bg[0].appendChild(frag);
        }
    };

    /* =========================================================
       PROGRESS BARS MODULE
       FIX: reads data-width attribute (set in HTML) instead of
            trying to read aria-valuenow or the already-zeroed style.
    ========================================================= */
    const ProgressBars = {
        _observers: [],

        init() {
            this.observe();
        },

        observe() {
            // CRITICAL FIX: Use .attr('data-width') NOT .data('width').
            // jQuery's .data() coerces "90%" → integer 90, setting width:90px not 90%.
            // .attr() always returns the raw authored string "90%".
            if (!('IntersectionObserver' in window)) {
                $('.progress-bar[data-width]').each(function () {
                    $(this).css('width', $(this).attr('data-width'));
                });
                return;
            }

            $('.progress-bar[data-width]').each((_, bar) => {
                const $bar = $(bar);
                const targetWidth = $bar.attr('data-width'); // raw string e.g. "90%"
                const observer = new IntersectionObserver(entries => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && !$bar.hasClass('animated')) {
                            setTimeout(() => {
                                $bar.css('width', targetWidth);
                                $bar.addClass('animated');
                            }, CONFIG.progressBarDelay);
                            observer.unobserve(bar);
                        }
                    });
                }, { threshold: 0.3 });

                observer.observe(bar);
                this._observers.push(observer);
            });
        },

        cleanup() {
            this._observers.forEach(o => o.disconnect());
            this._observers = [];
        }
    };

    /* =========================================================
       IMAGE HANDLER MODULE
    ========================================================= */
    const ImageHandler = {
        init() {
            this.protectProfile();
            this.fallbacks();
        },

        protectProfile() {
            $('.profile-photo img').on('contextmenu dragstart selectstart', e => {
                e.preventDefault();
                return false;
            });
        },

        fallbacks() {
            // Profile fallback
            $('.profile-photo img').on('error', function () {
                const $img = $(this);
                $img.hide();
                $img.parent().append(
                    $('<div class="profile-fallback"><i class="fas fa-user-circle"></i></div>')
                );
            });

            // Project image fallback — show icon instead of broken image
            $('.project-image img').on('error', function () {
                const $img   = $(this);
                const title  = $img.closest('.project-card').find('h4').text();
                const iconMap = {
                    'Instacart': 'fas fa-shopping-cart',
                    'Prêts':     'fas fa-money-check-alt',
                    'Bancaires': 'fas fa-money-check-alt',
                    'Ventes':    'fas fa-chart-line',
                    'Accidents': 'fas fa-car-crash'
                };
                let icon = 'fas fa-chart-bar';
                for (const [key, val] of Object.entries(iconMap)) {
                    if (title.includes(key)) { icon = val; break; }
                }
                $img.closest('.project-image').html(`<i class="${icon}" aria-hidden="true"></i>`);
            });
        }
    };

    /* =========================================================
       CONTACT FORM MODULE
       FIX: Single submit handler (was duplicated across two
            independent blocks in the original).
       FIX: showFormResult argument order normalised.
       FIX: Stores message key so Language module can retranslate.
    ========================================================= */
    const ContactForm = {
        $form:    null,
        $result:  null,
        $btn:     null,

        init() {
            this.$form   = $('#contactForm');
            this.$result = $('#form-result');
            this.$btn    = $('#submitBtn');
            if (!this.$form.length) return;

            this.$form.on('submit', e => {
                e.preventDefault();
                this.handle();
            });

            // Clear field error on input
            this.$form.find('input, textarea').on('input', function () {
                $(this).removeClass('is-invalid');
            });
        },

        validate() {
            const lang   = Language.get();
            const fields = [
                { $el: $('#contactName'),    fr: 'Le nom est requis.',       en: 'Name is required.' },
                { $el: $('#contactEmail'),   fr: "L'email est requis.",      en: 'Email is required.' },
                { $el: $('#contactSubject'), fr: 'Le sujet est requis.',     en: 'Subject is required.' },
                { $el: $('#contactMessage'), fr: 'Le message est requis.',   en: 'Message is required.' }
            ];

            for (const f of fields) {
                if (!f.$el.val().trim()) {
                    f.$el.addClass('is-invalid').trigger('focus');
                    this.showMessage(f[lang], 'error');
                    return false;
                }
            }

            const $email = $('#contactEmail');
            if (!Utils.isValidEmail($email.val().trim())) {
                $email.addClass('is-invalid').trigger('focus');
                this.showMessage(
                    lang === 'fr'
                        ? 'Veuillez entrer une adresse email valide.'
                        : 'Please enter a valid email address.',
                    'error'
                );
                return false;
            }
            return true;
        },

        handle() {
            this.$result.hide().removeClass('success error').empty();
            if (!this.validate()) return;

            const lang = Language.get();
            this.setLoading(true);

            const formData = new FormData(this.$form[0]);
            // FIX: Set language-appropriate subject line
            formData.set('subject',
                lang === 'fr'
                    ? 'Nouveau message depuis le portfolio — Chakib Belaiboud'
                    : 'New message from portfolio — Chakib Belaiboud'
            );
            // Ensure honeypot is empty string
            formData.set('botcheck', '');

            fetch('https://api.web3forms.com/submit', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        this.showMessage(
                            lang === 'fr'
                                ? 'Message envoyé avec succès ! Je vous répondrai dans les plus brefs délais.'
                                : 'Message sent successfully! I will get back to you soon.',
                            'success'
                        );
                        this.$form[0].reset();
                        this.$form.find('.is-invalid').removeClass('is-invalid');
                    } else {
                        this.showMessage(
                            data.message || (lang === 'fr' ? 'Une erreur est survenue.' : 'An error occurred.'),
                            'error'
                        );
                    }
                })
                .catch(() => {
                    const lang = Language.get();
                    this.showMessage(
                        lang === 'fr'
                            ? 'Erreur de connexion. Contactez-moi directement à chakib.bel@hotmail.com'
                            : 'Connection error. Contact me directly at chakib.bel@hotmail.com',
                        'error'
                    );
                })
                .finally(() => this.setLoading(false));
        },

        setLoading(on) {
            this.$btn.find('.btn-submit-text').toggleClass('d-none', on);
            this.$btn.find('.btn-spinner').toggleClass('d-none', !on);
            this.$btn.prop('disabled', on);
        },

        showMessage(msg, type) {
            const duration = type === 'success' ? CONFIG.successMsgDuration : CONFIG.errorMsgDuration;
            this.$result
                .removeClass('success error')
                .addClass(type)
                .html(`<p>${msg}</p>`)
                .fadeIn();

            // Store for re-translation on language switch
            this.$result.data('msg-key', type);

            clearTimeout(this._hideTimer);
            this._hideTimer = setTimeout(() => this.$result.fadeOut(), duration);

            $('html, body').animate({ scrollTop: this.$result.offset().top - 120 }, 300);
        },

        // Called by Language.apply() when language switches while message is visible
        showStoredMessage(lang) {
            const key = this.$result.data('msg-key');
            if (key === 'success') {
                this.$result.html(`<p>${
                    lang === 'fr'
                        ? 'Message envoyé avec succès ! Je vous répondrai dans les plus brefs délais.'
                        : 'Message sent successfully! I will get back to you soon.'
                }</p>`);
            }
        }
    };

    /* =========================================================
       BACK TO TOP MODULE
    ========================================================= */
    const BackToTop = {
        init() {
            const $btn = $('#backToTop');
            if (!$btn.length) return;

            $(window).on('scroll', Utils.throttle(() => {
                $btn.toggleClass('visible', $(window).scrollTop() > CONFIG.backToTopThreshold);
            }, 200));

            $btn.on('click', e => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    };

    /* =========================================================
       PROJECT CARDS MODULE
    ========================================================= */
    const ProjectCards = {
        init() {
            // Use CSS transitions for hover — only override JS when CSS is insufficient
            $(document).on('mouseenter', '.project-card', function () {
                $(this).css('transform', 'translateY(-8px)');
            }).on('mouseleave', '.project-card', function () {
                $(this).css('transform', '');
            });
        }
    };

    /* =========================================================
       BOOTSTRAP INIT
    ========================================================= */
    const BootstrapInit = {
        init() {
            try {
                document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                    new bootstrap.Tooltip(el);
                });
            } catch (e) {
                console.warn('Bootstrap tooltip init failed:', e);
            }
        }
    };

    /* =========================================================
       APP — SINGLE document.ready
       FIX: Original had TWO $(document).ready() blocks causing
            double initialisation of everything.
    ========================================================= */
    $(document).ready(function () {
        BootstrapInit.init();
        Language.init();          // Must come early — sets text before painting
        AnimatedBackground.init();
        Navigation.init();
        ProgressBars.init();
        ImageHandler.init();
        ContactForm.init();
        BackToTop.init();
        ProjectCards.init();
    });

})(jQuery);
