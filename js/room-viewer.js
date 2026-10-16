/* ==========================================================================
   Wellfit Designs — room-viewer.js
   "See How a Space Comes Together": tabbed room photos on the services page.

   Each tab crossfades to its room photo (CSS handles the fade and a slow
   push-in) and updates the description panel. Tabs follow the WAI-ARIA
   tabs pattern: arrow keys, Home and End move between rooms.
   ========================================================================== */
(function () {
  'use strict';

  const FORMA = (window.FORMA = window.FORMA || {});

  // Rooms, each framed by the service it illustrates.
  const ROOMS = {
    living: {
      name: 'Living',
      service: 'Residential Interior Design & Fit-Out',
      desc: 'Personalised interiors for villas and apartments, balancing comfort, aesthetics and everyday practicality.',
      specs: [['Scope', 'Villa and apartment interiors'], ['Design', 'Living-room design'], ['Finishes', 'Flooring and wall finishes']],
    },
    bedroom: {
      name: 'Bedroom',
      service: 'Residential Interior Design & Fit-Out',
      desc: 'Your home should reflect your lifestyle while providing comfort, functionality and a sense of belonging.',
      specs: [['Design', 'Living-room and bedroom design'], ['Joinery', 'Custom wardrobes and storage'], ['Lighting', 'Ceiling and lighting coordination']],
    },
    kitchen: {
      name: 'Kitchen',
      service: 'Custom Joinery & Carpentry',
      desc: 'Bespoke cabinetry, built-in storage, feature panels and custom furniture, supported by our joinery production facility in Ajman.',
      specs: [['Joinery', 'Wardrobes and kitchen cabinetry'], ['Furniture', 'Bespoke furniture and built-in units'], ['Produced', 'Ajman joinery facility']],
    },
    dining: {
      name: 'Dining',
      service: 'Ceiling, Partition & Finishing Works',
      desc: 'Finishes define the character of an interior. We coordinate the ceiling, partition and finishing works so that they complement the wider design.',
      specs: [['Ceilings', 'Suspended and decorative ceilings'], ['Walls', 'Feature walls and cladding'], ['Lighting', 'Integrated lighting coordination']],
    },
    office: {
      name: 'Study',
      service: 'Interior Design & Space Planning',
      desc: 'Every successful interior begins with a clear understanding of how a space should look, feel and function.',
      specs: [['Planning', 'Space planning and layout development'], ['Materials', 'Material and finish selection'], ['Joinery', 'Furniture and joinery coordination']],
    },
  };
  const ORDER = Object.keys(ROOMS);

  const RoomViewer = {
    init(root, env) {
      if (!root) return null;
      const viewer = Object.create(RoomViewer.prototype);
      viewer.setup(root, env || {});
      return viewer;
    },
    prototype: {
      setup(root, env) {
        this.root = root;
        this.env = env;
        this.tabs = Array.from(root.querySelectorAll('[role="tab"]'));
        this.panel = root.querySelector('[data-viewer-panel]');
        this.frame = root.querySelector('[data-viewer-frame]');
        this.slides = Array.from(root.querySelectorAll('[data-room-slide]'));
        this.current = 'living';

        this.tabs.forEach((tab) => {
          tab.addEventListener('click', () => this.select(tab.dataset.room, true));
          tab.addEventListener('keydown', (e) => this.onTabKey(e, tab));
        });
      },

      onTabKey(e, tab) {
        const i = this.tabs.indexOf(tab);
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % this.tabs.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + this.tabs.length) % this.tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = this.tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        this.tabs[next].focus();
        this.select(this.tabs[next].dataset.room, true);
      },

      select(room, userInitiated) {
        if (!ROOMS[room] || room === this.current) return;
        const previous = this.current;
        this.current = room;

        this.tabs.forEach((t) => {
          const on = t.dataset.room === room;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
        });
        this.panel.setAttribute('aria-labelledby', 'tab-' + room);
        this.updatePanel(ROOMS[room], ORDER.indexOf(room));
        this.slides.forEach((slide) => slide.classList.toggle('is-active', slide.dataset.roomSlide === room));
        if (userInitiated && FORMA.Animations && FORMA.Animations.pulse) FORMA.Animations.pulse(this.frame, previous);
      },

      updatePanel(data, index) {
        const p = this.panel;
        p.classList.add('is-changing');
        window.setTimeout(() => {
          p.querySelector('[data-room-index]').textContent = String(index + 1).padStart(2, '0');
          p.querySelector('[data-room-name]').textContent = data.name;
          p.querySelector('[data-room-project]').textContent = data.service;
          p.querySelector('[data-room-desc]').textContent = data.desc;
          const specs = p.querySelector('[data-room-specs]');
          specs.replaceChildren(...data.specs.map(([label, value]) => {
            const row = document.createElement('div');
            const dt = document.createElement('dt');
            const dd = document.createElement('dd');
            dt.textContent = label;
            dd.textContent = value;
            row.append(dt, dd);
            return row;
          }));
          p.classList.remove('is-changing');
        }, this.env.reducedMotion ? 0 : 320);
      },
    },
  };

  FORMA.RoomViewer = RoomViewer;
})();
