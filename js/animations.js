/* ==========================================================================
   Wellfit Designs — animations.js
   GSAP + ScrollTrigger choreography:
     • page-load transition (loader → hero on the home page, a quick
       title reveal on inner pages)
     • text splitting and line reveals
     • fade/slide-up and clip-path image reveals, image parallax
     • pinned hero with scroll-driven 3D camera and cinematic crop
     • horizontal services scroll, process timelines, CTA
   Everything degrades to "content simply visible" when GSAP is missing or
   the visitor prefers reduced motion.
   ========================================================================== */
(function () {
  'use strict';

  const FORMA = (window.FORMA = window.FORMA || {});
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ------------------------------------------------------------------------
     Text splitting — wraps each word in a masked span. The original text is
     kept in a visually hidden copy for assistive tech (aria-label is not
     reliable on paragraphs); the animated spans are hidden from it. Words
     inside an inline element (e.g. <em class="accent">) keep its class.
     ------------------------------------------------------------------------ */
  function splitWords(el) {
    if (el.dataset.splitDone) return $$('.split-line > span', el);
    const words = [];
    el.childNodes.forEach((node) => {
      if (node.nodeName === 'BR') { words.push({ br: true }); return; }
      const cls = node.nodeType === Node.ELEMENT_NODE ? node.className : '';
      node.textContent.split(/\s+/).filter(Boolean).forEach((word) => words.push({ word, cls }));
    });
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = words.filter((w) => !w.br).map((w) => w.word).join(' ');
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    words.forEach(({ word, cls, br }, i) => {
      if (br) { visual.appendChild(document.createElement('br')); return; }
      const mask = document.createElement('span');
      mask.className = 'split-line';
      mask.style.display = 'inline-block';
      const inner = document.createElement('span');
      if (cls) inner.className = cls;
      inner.textContent = word;
      mask.appendChild(inner);
      visual.appendChild(mask);
      if (i < words.length - 1) visual.appendChild(document.createTextNode(' '));
    });
    el.textContent = '';
    el.append(sr, visual);
    el.dataset.splitDone = '1';
    return $$('.split-line > span', el);
  }

  const Animations = {
    env: {},
    ready: false,

    init(env) {
      this.env = env || {};
      this.gsap = window.gsap;
      this.ST = window.ScrollTrigger;
      this.enabled = !!(this.gsap && this.ST) && !this.env.reducedMotion;
      const introTitle = $('[data-intro-title]');
      this.introWords = introTitle ? splitWords(introTitle) : [];
      this.splits = $$('[data-split]').map((el) => ({ el, words: splitWords(el) }));

      if (!this.enabled) {
        // Without scroll choreography, pinned sections fall back to native
        // scrolling (see .motion-off in style.css).
        document.documentElement.classList.add('motion-off');
        this.ready = true;
        return this;
      }
      const { gsap } = this;
      gsap.registerPlugin(this.ST);
      gsap.defaults({ ease: 'expo.out', duration: 1.2 });
      this.ST.config({ ignoreMobileResize: true });

      // Initial states are set from JS only, so content stays visible if
      // scripts fail.
      if (this.introWords.length) gsap.set(this.introWords, { yPercent: 110 });
      const heroItems = $$('[data-hero-item]');
      if (heroItems.length) gsap.set(heroItems, { y: 28, opacity: 0 });
      gsap.set('[data-header]', { y: -24, opacity: 0 });

      this.setupReveals();
      this.setupHero();
      this.setupServices();
      this.setupProcess();
      this.setupCounters();
      this.setupCTA();
      this.ready = true;
      return this;
    },

    /** Loader → hero page transition. Resolves when the hero is revealed. */
    playIntro() {
      const loader = $('[data-loader]');
      const done = () => {
        if (loader) loader.remove();
        document.documentElement.classList.add('is-loaded');
      };
      if (!this.enabled) {
        if (loader) {
          loader.style.transition = 'opacity 0.4s ease';
          loader.style.opacity = '0';
          window.setTimeout(done, this.env.reducedMotion ? 50 : 400);
        } else {
          done();
        }
        this.countersInstant();
        return Promise.resolve();
      }
      const { gsap } = this;
      const heroMedia = $$('.hero__poster img, .hero__canvas');
      const heroItems = $$('[data-hero-item]');
      return new Promise((resolve) => {
        const tl = gsap.timeline({ onComplete: () => { done(); resolve(); } });
        if (loader) {
          tl.to('.loader__word span', { yPercent: -105, duration: 0.6, ease: 'expo.in' })
            .to('.loader__line, .loader__caption', { opacity: 0, duration: 0.3 }, '<')
            .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'expo.inOut' }, '-=0.15');
          loader.classList.add('is-done');
        }
        if (heroMedia.length) tl.fromTo(heroMedia, { scale: 1.12 }, { scale: 1, duration: 2.2, ease: 'expo.out' }, loader ? '<0.1' : 0);
        if (this.introWords.length) tl.to(this.introWords, { yPercent: 0, duration: 1.3, stagger: 0.05 }, loader ? '<0.35' : 0.05);
        if (heroItems.length) tl.to(heroItems, { y: 0, opacity: 1, duration: 1.2, stagger: 0.08 }, '<0.25');
        tl.to('[data-header]', { y: 0, opacity: 1, duration: 1 }, loader ? '<0.2' : 0);
      });
    },

    setupReveals() {
      const { gsap, ST } = this;

      // Headline words rise out of their masks.
      this.splits.forEach(({ el, words }) => {
        gsap.set(words, { yPercent: 110 });
        ST.create({
          trigger: el,
          start: 'top 88%',
          once: true,
          onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.3, stagger: 0.06 }),
        });
      });

      // Fade / slide up, batched for performance.
      const ups = $$('[data-reveal="up"]');
      if (ups.length) {
        gsap.set(ups, { y: 36, opacity: 0 });
        ST.batch(ups, {
          start: 'top 90%',
          once: true,
          onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 1.1, stagger: 0.08 }),
        });
      }

      // Clip-path image reveal with a counter-scale on the image.
      $$('[data-reveal="clip"]').forEach((el) => {
        const img = $('img', el);
        gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
        if (img) gsap.set(img, { scale: 1.25 });
        ST.create({
          trigger: el,
          start: 'top 85%',
          once: true,
          onEnter: () => {
            gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut' });
            if (img) gsap.to(img, { scale: 1, duration: 2, ease: 'expo.out', delay: 0.1 });
          },
        });
      });

      // Image parallax inside its frame.
      $$('.media [data-parallax]').forEach((img) => {
        gsap.fromTo(img, { yPercent: -6 }, {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: { trigger: img.closest('.media'), start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });

      // Service and audience cards: light stagger on entry.
      const cards = $$('.service-card, .serve-card');
      if (cards.length) {
        ST.batch(cards, {
          start: 'top 92%',
          once: true,
          onEnter: (batch) => gsap.fromTo(batch, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, stagger: 0.1 }),
        });
      }
    },

    // Hero: pinned while the 3D camera walks into the room; content lifts
    // away and the frame tightens into a cinematic crop before release.
    setupHero() {
      const { gsap } = this;
      const hero = $('[data-hero]');
      if (!hero) return;
      const media = $('[data-hero-media]');
      const content = $('.hero__content');
      const meta = $('.hero__meta');
      const mm = gsap.matchMedia();

      mm.add('(min-width: 768px)', () => {
        const tl = gsap.timeline({
          defaults: { ease: 'none', duration: 1 },
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: '+=120%',
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            onUpdate: (self) => { if (FORMA.hero) FORMA.hero.setScroll(self.progress); },
          },
        });
        tl.to(content, { y: -80, opacity: 0, duration: 0.45 }, 0)
          .to(meta, { opacity: 0, duration: 0.25 }, 0)
          .to('.hero__poster img', { scale: 1.14, duration: 1 }, 0)
          .to('.hero__shade', { opacity: 0.35, duration: 0.6 }, 0)
          .fromTo(media, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(7% 4% 7% 4%)', duration: 0.45, ease: 'power2.inOut' }, 0.55);
        return () => { if (FORMA.hero) FORMA.hero.setScroll(0); };
      });

      mm.add('(max-width: 767px)', () => {
        gsap.to('.hero__poster img', {
          yPercent: 12,
          ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
        });
        gsap.to(content, {
          y: -40,
          opacity: 0,
          ease: 'none',
          scrollTrigger: { trigger: hero, start: 'center center', end: 'bottom top', scrub: true },
        });
      });
    },

    // Desktop: vertical scroll drives a horizontal track of service cards.
    setupServices() {
      const { gsap } = this;
      const pin = $('[data-services-pin]');
      const viewport = $('[data-services-viewport]');
      const track = $('[data-services-track]');
      const bar = $('[data-services-progress]');
      if (!pin || !track) return;
      const mm = gsap.matchMedia();
      mm.add('(min-width: 993px)', () => {
        const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: pin,
            start: 'center center',
            end: () => '+=' + distance(),
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
            onUpdate: (self) => { if (bar) bar.style.transform = `scaleX(${self.progress})`; },
          },
        });
      });
    },

    setupProcess() {
      const { gsap, ST } = this;
      $$('[data-timeline]').forEach((timeline) => {
        const fill = $('[data-timeline-fill]', timeline);
        if (fill) {
          gsap.fromTo(fill, { scaleY: 0 }, {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: timeline, start: 'top 65%', end: 'bottom 65%', scrub: true },
          });
        }
        $$('[data-step]', timeline).forEach((step) => {
          ST.create({
            trigger: step,
            start: 'top 68%',
            onEnter: () => step.classList.add('is-active'),
            onLeaveBack: () => step.classList.remove('is-active'),
          });
          gsap.from($('.timeline__title', step), {
            x: -24,
            duration: 1.2,
            scrollTrigger: { trigger: step, start: 'top 75%', once: true },
          });
        });
      });
    },

    setupCounters() {
      const { gsap, ST } = this;
      const stats = $('[data-stats]');
      if (!stats) return;
      const nums = $$('[data-count]', stats);
      nums.forEach((n) => (n.textContent = '0'));
      ST.create({
        trigger: stats,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          nums.forEach((n, i) => {
            const target = Number(n.dataset.count);
            const obj = { v: 0 };
            gsap.to(obj, {
              v: target,
              duration: 2.2,
              delay: i * 0.12,
              ease: 'power3.out',
              onUpdate: () => (n.textContent = Math.round(obj.v)),
            });
          });
        },
      });
    },

    countersInstant() {
      $$('[data-count]').forEach((n) => (n.textContent = n.dataset.count));
      $$('[data-step]').forEach((s) => s.classList.add('is-active'));
    },

    setupCTA() {
      const { gsap } = this;
      const img = $('[data-cta-image]');
      if (!img) return;
      gsap.fromTo(img, { yPercent: -8, scale: 1.08 }, {
        yPercent: 8,
        scale: 1,
        ease: 'none',
        scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    },

    /** Small feedback pulse used by the room viewer's CSS fallback. */
    pulse(el) {
      if (!this.enabled || !el || el.classList.contains('is-webgl')) return;
      this.gsap.fromTo(el, { scale: 0.985 }, { scale: 1, duration: 1.2 });
    },

    refresh() {
      if (this.ST) this.ST.refresh();
    },
  };

  FORMA.Animations = Animations;
})();
