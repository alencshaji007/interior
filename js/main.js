/* ==========================================================================
   Wellfit Designs — main.js
   Initialisation and UI:
     • environment / capability detection
     • boot sequence (loader → intro → on-demand 3D)
     • header, mobile menu, active navigation
     • custom cursor and magnetic buttons
     • card tilt, project dialog
     • enquiry form validation and success state
   ========================================================================== */
(function () {
  'use strict';

  const FORMA = (window.FORMA = window.FORMA || {});
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const mq = (q) => window.matchMedia(q);

  /* ------------------------------------------------------------------------
     Environment
     ------------------------------------------------------------------------ */

  function detectWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) {
      return false;
    }
  }

  const env = (FORMA.env = {
    reducedMotion: mq('(prefers-reduced-motion: reduce)').matches,
    touch: mq('(hover: none), (pointer: coarse)').matches,
    isFile: location.protocol === 'file:',
    saveData: !!(navigator.connection && navigator.connection.saveData),
    lowMemory: typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4,
    webgl: detectWebGL(),
  });
  // The small real-time 3D ornaments run only where they are affordable:
  // larger screens, capable devices, no data-saver and no reduced-motion
  // preference. Everyone else simply goes without them.
  env.live3D = env.webgl && !env.reducedMotion && !env.saveData && !env.lowMemory &&
    window.innerWidth >= 768 && !(env.touch && window.innerWidth < 1024);
  // ?no3d turns them off (handy for testing and slow GPUs).
  if (new URLSearchParams(location.search).has('no3d')) env.live3D = false;

  root.classList.add('js');
  if (env.reducedMotion) root.classList.add('reduced-motion');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  const wait = (ms) => new Promise((r) => window.setTimeout(r, ms));
  const idle = (fn) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 1200 }) : window.setTimeout(fn, 200));

  /* ------------------------------------------------------------------------
     Header: transparent over the hero, solid + blurred once scrolling,
     tucks away on scroll down and returns on scroll up.
     ------------------------------------------------------------------------ */

  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      header.classList.toggle('is-solid', y > 40);
      const goingDown = y > lastY + 4;
      const goingUp = y < lastY - 4;
      if (goingDown && y > window.innerHeight * 0.9 && !document.body.classList.contains('menu-open')) header.classList.add('is-hidden');
      else if (goingUp || y < 200) header.classList.remove('is-hidden');
      lastY = y;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
    update();

    // In-page links (#section) highlight while their section is in view.
    // Links to other pages are marked with aria-current in the markup.
    const links = $$('.nav__link').filter((a) => a.getAttribute('href').startsWith('#'));
    if (!links.length) return;
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = map.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) {
          links.forEach((l) => { l.classList.remove('is-active'); l.removeAttribute('aria-current'); });
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  function initMobileMenu() {
    const toggle = $('[data-menu-toggle]');
    const menu = $('[data-mobile-menu]');
    if (!toggle || !menu) return;
    const label = $('.sr-only', toggle);
    let closeTimer = 0;

    const open = () => {
      window.clearTimeout(closeTimer);
      menu.hidden = false;
      void menu.offsetWidth; // allow the clip-path transition to run
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      label.textContent = 'Close menu';
      document.body.classList.add('menu-open', 'is-locked');
      const first = $('a', menu);
      if (first) first.focus({ preventScroll: true });
    };
    const close = (restoreFocus = true) => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      label.textContent = 'Open menu';
      document.body.classList.remove('menu-open', 'is-locked');
      closeTimer = window.setTimeout(() => { menu.hidden = true; }, env.reducedMotion ? 0 : 800);
      if (restoreFocus) toggle.focus({ preventScroll: true });
    };

    toggle.addEventListener('click', () => (toggle.getAttribute('aria-expanded') === 'true' ? close() : open()));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => close(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
      close();
    });
    // Keep keyboard focus inside the open menu (toggle included).
    menu.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = [toggle, ...$$('a, button', menu)];
      const i = focusables.indexOf(document.activeElement);
      if (e.shiftKey && i <= 1) { e.preventDefault(); toggle.focus(); }
      else if (!e.shiftKey && i === focusables.length - 1) { e.preventDefault(); toggle.focus(); }
    });
    mq('(min-width: 993px)').addEventListener('change', (e) => { if (e.matches && !menu.hidden) close(false); });
  }

  /* ------------------------------------------------------------------------
     Custom cursor (fine pointers only)
     ------------------------------------------------------------------------ */

  function initCursor() {
    if (env.touch || !mq('(pointer: fine)').matches) return;
    const el = $('[data-cursor-root]');
    if (!el) return;
    const dot = $('.cursor__dot', el);
    const ring = $('.cursor__ring', el);
    const label = $('.cursor__label', el);
    root.classList.add('has-cursor');

    const pos = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let raf = 0;
    const lag = env.reducedMotion ? 1 : 0.2;

    const render = () => {
      ringPos.x += (pos.x - ringPos.x) * lag;
      ringPos.y += (pos.y - ringPos.y) * lag;
      ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;
      raf = Math.abs(pos.x - ringPos.x) + Math.abs(pos.y - ringPos.y) > 0.2 ? requestAnimationFrame(render) : 0;
    };

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      pos.x = e.clientX;
      pos.y = e.clientY;
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      el.classList.remove('is-hidden');
      if (!raf) raf = requestAnimationFrame(render);
    }, { passive: true });

    document.addEventListener('pointerover', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const labelled = target.closest('[data-cursor]');
      const interactive = target.closest('a, button, label, select, summary, [role="tab"]');
      const dark = target.closest('.hero, .section--dark, .facts, .cta, .footer');
      el.classList.toggle('is-light', !!dark && !labelled);
      if (labelled) {
        label.textContent = labelled.dataset.cursor === 'view' ? 'VIEW' : 'EXPLORE';
        el.classList.add('is-label');
        el.classList.remove('is-link');
      } else {
        el.classList.remove('is-label');
        el.classList.toggle('is-link', !!interactive);
      }
    });
    document.addEventListener('pointerleave', () => el.classList.add('is-hidden'));
    window.addEventListener('blur', () => el.classList.add('is-hidden'));
  }

  // Buttons lean towards the pointer, with their label moving a little more.
  function initMagnetic() {
    if (env.touch || env.reducedMotion) return;
    $$('.magnetic').forEach((btn) => {
      const inner = btn.firstElementChild;
      const strength = btn.classList.contains('icon-btn') ? 0.35 : 0.22;
      let frame = 0;
      const set = (x, y) => {
        btn.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        if (inner) inner.style.transform = `translate3d(${x * 0.45}px, ${y * 0.45}px, 0)`;
      };
      btn.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
      if (inner) inner.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
      btn.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = btn.getBoundingClientRect();
          set((e.clientX - (r.left + r.width / 2)) * strength, (e.clientY - (r.top + r.height / 2)) * strength);
        });
      });
      btn.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); set(0, 0); });
    });
  }

  /* ------------------------------------------------------------------------
     Cards: tilt + moving highlight
     ------------------------------------------------------------------------ */

  function initTilt() {
    if (env.touch || env.reducedMotion) return;
    $$('[data-tilt]').forEach((card) => {
      const media = $('[data-tilt-media]', card);
      if (!media) return;
      let frame = 0;
      card.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = media.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          media.style.transform = `rotateX(${(0.5 - py) * 7}deg) rotateY(${(px - 0.5) * 9}deg) translateZ(0)`;
          media.style.setProperty('--lx', `${px * 100}%`);
          media.style.setProperty('--ly', `${py * 100}%`);
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        media.style.transform = '';
      });
    });
  }

  /* ------------------------------------------------------------------------
     Project dialog
     ------------------------------------------------------------------------ */

  function initProjects() {
    const dialog = $('[data-project-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const content = $('[data-dialog-content]', dialog);
    let opener = null;

    const open = (link) => {
      const tpl = document.getElementById('project-' + link.dataset.project);
      if (!tpl) return;
      opener = link;
      content.textContent = '';
      const figure = document.createElement('div');
      figure.className = 'project-dialog__image';
      const picture = $('picture', link).cloneNode(true);
      const img = $('img', picture);
      img.removeAttribute('data-parallax');
      img.removeAttribute('style');
      img.loading = 'eager';
      img.sizes = '(min-width: 992px) 50vw, 100vw';
      $$('source', picture).forEach((s) => (s.sizes = img.sizes));
      figure.appendChild(picture);
      const body = document.createElement('div');
      body.className = 'project-dialog__body';
      body.appendChild(tpl.content.cloneNode(true));
      content.append(figure, body);
      dialog.showModal();
      document.body.classList.add('is-locked');
      dialog.scrollTop = 0;
      $('[data-dialog-close]', dialog).focus();
    };

    $$('[data-project]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        open(link);
      });
    });
    $('[data-dialog-close]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('is-locked');
      if (opener) opener.focus({ preventScroll: true });
    });
  }

  /* ------------------------------------------------------------------------
     Enquiry form — client-side validation only (static site)
     ------------------------------------------------------------------------ */

  function initForm() {
    const form = $('[data-form]');
    const success = $('[data-form-success]');
    if (!form || !success) return;

    // Checked in document order, so the first invalid field gets focus.
    const rules = {
      name: (v) => (v.trim().length >= 2 ? '' : 'Please enter your full name.'),
      phone: (v) => {
        const digits = v.replace(/\D/g, '');
        if (!v.trim()) return 'Please enter a phone number.';
        return /^[+()\d\s-]+$/.test(v.trim()) && digits.length >= 8 && digits.length <= 15 ? '' : 'Please enter a valid phone number.';
      },
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid email address.'),
      projectType: (v) => (v ? '' : 'Please choose a project type.'),
      location: (v) => (v.trim().length >= 2 ? '' : 'Please enter the project location.'),
      message: (v) => (v.trim().length >= 10 ? '' : 'Please describe your project (at least 10 characters).'),
      contactMethod: (v) => (v ? '' : 'Please choose how we should contact you.'),
    };

    const controlOf = (name) => {
      const el = form.elements[name];
      return el instanceof RadioNodeList ? Array.from(el) : [el];
    };
    const fieldOf = (name) => controlOf(name)[0].closest('.field');
    const errorOf = (name) => $('.field__error', fieldOf(name));

    const validate = (name) => {
      // RadioNodeList.value is the checked option's value, or ''.
      const message = rules[name](form.elements[name].value);
      fieldOf(name).classList.toggle('is-invalid', !!message);
      errorOf(name).textContent = message;
      controlOf(name).forEach((c) => c.setAttribute('aria-invalid', message ? 'true' : 'false'));
      return !message;
    };

    Object.keys(rules).forEach((name) => {
      controlOf(name).forEach((c) => {
        c.addEventListener('blur', () => { if (c.value || fieldOf(name).classList.contains('is-invalid')) validate(name); });
        c.addEventListener('input', () => { if (fieldOf(name).classList.contains('is-invalid')) validate(name); });
        c.addEventListener('change', () => validate(name));
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalid = Object.keys(rules).filter((name) => !validate(name));
      if (invalid.length) {
        controlOf(invalid[0])[0].focus();
        return;
      }
      const button = $('[data-submit]', form);
      button.disabled = true;
      button.classList.add('is-loading');
      // No backend yet: simulate a short send, then show the confirmation.
      window.setTimeout(() => {
        const first = form.elements.name.value.trim().split(/\s+/)[0];
        $('[data-success-name]', success).textContent = first ? ', ' + first : '';
        form.hidden = true;
        success.hidden = false;
        success.focus();
        button.disabled = false;
        button.classList.remove('is-loading');
        if (FORMA.Animations) FORMA.Animations.refresh();
      }, 900);
    });

    $('[data-form-reset]', success).addEventListener('click', () => {
      form.reset();
      $$('.field', form).forEach((f) => f.classList.remove('is-invalid'));
      $$('.field__error', form).forEach((f) => (f.textContent = ''));
      $$('[aria-invalid]', form).forEach((c) => c.removeAttribute('aria-invalid'));
      success.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
      if (FORMA.Animations) FORMA.Animations.refresh();
    });
  }

  /* ------------------------------------------------------------------------
     3D — loaded on demand
     ------------------------------------------------------------------------ */

  async function start3D() {
    if (!env.live3D) return;
    const ornaments = $$('[data-ornament]');
    if (!ornaments.length) return;
    try {
      await loadScript('assets/vendor/three.bundle.min.js');
      await loadScript('js/room-kit.js');
      await loadScript('js/three-scene.js');
      if (!FORMA.Three) throw new Error('three-scene.js did not initialise');
      root.classList.add('has-3d');
      idle(() => FORMA.Three.createOrnaments(ornaments).then((list) => { FORMA.ornaments = list; }));
    } catch (err) {
      root.classList.remove('has-3d');
      console.warn('[Wellfit] Real-time 3D unavailable, using still imagery.', err);
    }
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  // A missing or failed image shows its quiet frame colour instead of the
  // browser's broken-image icon and alt text.
  function initImageFallbacks() {
    const mark = (img) => img.classList.add('is-missing');
    document.addEventListener('error', (e) => {
      if (e.target instanceof HTMLImageElement) mark(e.target);
    }, true);
    document.addEventListener('load', (e) => {
      if (e.target instanceof HTMLImageElement) e.target.classList.remove('is-missing');
    }, true);
    // Images that already failed before this script ran.
    $$('img').forEach((img) => { if (img.complete && img.currentSrc && img.naturalWidth === 0) mark(img); });
  }

  function initSmallThings() {
    $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
  }

  async function boot() {
    const t0 = performance.now();
    initHeader();
    initMobileMenu();
    initCursor();
    initMagnetic();
    initTilt();
    initProjects();
    initForm();
    initSmallThings();
    initImageFallbacks();
    FORMA.roomViewer = FORMA.RoomViewer ? FORMA.RoomViewer.init($('[data-room-viewer]'), env) : null;

    const anim = FORMA.Animations ? FORMA.Animations.init(env) : null;

    // Home: keep the loader to about a second — wait for fonts (briefly) and
    // a minimum display time so the logo animation can complete. Inner pages
    // have no loader and only wait briefly for fonts.
    const hasLoader = !!$('[data-loader]');
    const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(hasLoader ? 700 : 300)]) : Promise.resolve();
    const minimum = hasLoader ? (env.reducedMotion ? 150 : 950) : 0;
    await Promise.all([fonts, wait(Math.max(0, minimum - (performance.now() - t0)))]);

    if (anim) await anim.playIntro();
    else {
      const loader = $('[data-loader]');
      if (loader) loader.remove();
    }
    idle(start3D);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Release GPU resources when leaving the page.
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return; // kept in the back/forward cache — keep scenes alive
    (FORMA.ornaments || []).forEach((o) => o.dispose());
  });
})();
