// Functional checks for interactive UI (form, dialog, tabs, carousel, menu).
//   node check-ui.mjs http://127.0.0.1:8080/index.html?no3d
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2];
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const errors = [];

// Desktop
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(2500);

  // Form: empty submit
  await page.evaluate(() => document.querySelector('#contact').scrollIntoView());
  await page.click('[data-submit]');
  const errs = await page.$$eval('.field__error', (els) => els.filter((e) => e.textContent.trim()).length);
  check('empty form shows 6 errors', errs === 6, `${errs} errors`);
  check('focus moves to first invalid field', await page.evaluate(() => document.activeElement.id === 'f-name'));
  await page.fill('#f-name', 'Anika Menon');
  await page.fill('#f-email', 'anika@example');
  await page.locator('#f-email').blur();
  check('invalid email flagged', (await page.textContent('#f-email-error')).includes('valid email'));
  await page.fill('#f-email', 'anika@example.com');
  await page.fill('#f-phone', '12');
  await page.locator('#f-phone').blur();
  check('short phone flagged', (await page.textContent('#f-phone-error')).includes('valid phone'));
  await page.fill('#f-phone', '+91 98765 43210');
  await page.selectOption('#f-type', 'Villa');
  await page.check('input[name="budget"][value="₹50L – ₹1Cr"]', { force: true });
  await page.fill('#f-message', 'A four-bedroom villa in Kochi, moving in next spring.');
  check('success hidden before submit', await page.isHidden('[data-form-success]'));
  await page.click('[data-submit]');
  await page.waitForTimeout(1300);
  check('success shown after valid submit', await page.isVisible('[data-form-success]'));
  check('form hidden after submit', await page.isHidden('[data-form]'));
  check('success greets by first name', (await page.textContent('[data-success-name]')) === ', Anika');
  await page.click('[data-form-reset]');
  check('reset restores empty form', (await page.isVisible('[data-form]')) && (await page.inputValue('#f-name')) === '');

  // Project dialog
  await page.evaluate(() => document.querySelector('#work').scrollIntoView());
  await page.waitForTimeout(500);
  await page.click('[data-project="glass"]');
  await page.waitForTimeout(400);
  check('project dialog opens', await page.evaluate(() => document.querySelector('[data-project-dialog]').open));
  check('dialog shows project title', (await page.textContent('#dialog-title')) === 'The Glass Villa');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape closes dialog', !(await page.evaluate(() => document.querySelector('[data-project-dialog]').open)));
  check('focus returns to project link', await page.evaluate(() => document.activeElement.dataset.project === 'glass'));

  // Room tabs
  await page.focus('#tab-living');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  check('ArrowRight selects Bedroom tab', (await page.getAttribute('#tab-bedroom', 'aria-selected')) === 'true');
  check('panel text updates', (await page.textContent('[data-room-name]')) === 'Bedroom');
  await page.keyboard.press('End');
  await page.waitForTimeout(600);
  check('End selects Office', (await page.textContent('[data-room-name]')) === 'Office');

  // Carousel
  const current = () => page.$$eval('[data-slide]', (s) => s.findIndex((x) => !x.hidden));
  const before = await current();
  await page.click('[data-carousel-next]');
  await page.waitForTimeout(700);
  const after = await current();
  check('carousel next advances one slide', after === (before + 1) % 3, `${before} → ${after}`);
  check('matching dot is current', (await page.getAttribute(`[data-carousel-dots] button:nth-child(${after + 1})`, 'aria-current')) === 'true');
  await page.click('[data-carousel-prev]');
  await page.waitForTimeout(700);
  check('carousel prev goes back', (await current()) === before);

  // Nav links resolve to sections
  const missing = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !h.startsWith('#project-') && !document.querySelector(h)));
  check('all in-page links have targets', missing.length === 0, missing.join(', '));
  const heads = await page.$$eval('h1', (h) => h.length);
  check('exactly one h1', heads === 1);
  const noAlt = await page.$$eval('img', (imgs) => imgs.filter((i) => !i.hasAttribute('alt')).length);
  check('every img has alt', noAlt === 0);
  await page.close();
}

// Mobile menu
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.click('[data-menu-toggle]');
  await page.waitForTimeout(900);
  check('mobile menu opens', (await page.getAttribute('[data-menu-toggle]', 'aria-expanded')) === 'true' && (await page.isVisible('#mobile-menu')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  check('Escape closes mobile menu', (await page.getAttribute('[data-menu-toggle]', 'aria-expanded')) === 'false' && (await page.isHidden('#mobile-menu')));
  await page.click('[data-menu-toggle]');
  await page.waitForTimeout(900);
  await page.click('#mobile-menu a[href="#process"]');
  await page.waitForTimeout(1500);
  check('menu link navigates + closes', (await page.isHidden('#mobile-menu')) && (await page.evaluate(() => window.scrollY > 1000)));
  check('no horizontal overflow on mobile', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.close();
}
console.log(results.join('\n'));
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
