// Functional checks for interactive UI across the six pages (navigation,
// project dialog, room tabs, FAQ, enquiry form, mobile menu).
//   node check-ui.mjs http://127.0.0.1:8080/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const base = (process.argv[2] || 'http://127.0.0.1:8080/').replace(/\/?$/, '/');
const PAGES = ['index.html', 'about.html', 'services.html', 'projects.html', 'process.html', 'contact.html'];
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const errors = [];
const open = async (page, path) => {
  await page.goto(base + path + (path.includes('?') ? '&' : '?') + 'no3d');
  await page.waitForTimeout(2200);
};

// Every page: structure, links, navigation state
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of PAGES) {
    await open(page, path);
    const h1 = await page.$$eval('h1', (h) => h.length);
    check(`${path}: exactly one h1`, h1 === 1, `${h1}`);
    const noAlt = await page.$$eval('img', (imgs) => imgs.filter((i) => !i.hasAttribute('alt')).length);
    check(`${path}: every img has alt`, noAlt === 0);
    const missing = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.querySelector(h)));
    check(`${path}: in-page links have targets`, missing.length === 0, missing.join(', '));
    const broken = await page.$$eval('img', (imgs) => imgs.filter((i) => i.complete && i.loading !== 'lazy' && i.naturalWidth === 0).map((i) => i.src));
    check(`${path}: eager images load`, broken.length === 0, broken.join(', '));
    if (path !== 'index.html') {
      const current = await page.getAttribute('.nav__link[aria-current="page"]', 'href');
      check(`${path}: nav marks current page`, current === path, `${current}`);
    }
  }
  // Cross-page anchors resolve on their target page.
  const cross = new Set();
  for (const path of PAGES) {
    await open(page, path);
    (await page.$$eval('a[href*=".html#"]', (as) => as.map((a) => a.getAttribute('href')))).forEach((h) => cross.add(h));
  }
  const bad = [];
  for (const href of cross) {
    const [file, id] = href.split('#');
    await page.goto(base + file + '?no3d');
    if (!(await page.$('#' + id))) bad.push(href);
  }
  check('cross-page anchors resolve', bad.length === 0, bad.join(', ') || `${cross.size} checked`);
  await page.close();
}

// Home: hero title, project dialog
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'index.html');
  const h1 = (await page.textContent('h1 .sr-only')) || '';
  check('hero title keeps accessible text', h1 === 'Designs that fit your vision.', h1);
  await page.evaluate(() => document.querySelector('#work').scrollIntoView());
  await page.waitForTimeout(500);
  await page.click('[data-project="inva"]');
  await page.waitForTimeout(400);
  check('project dialog opens', await page.evaluate(() => document.querySelector('[data-project-dialog]').open));
  check('dialog shows project title', (await page.textContent('#dialog-title')) === 'INVA Investors');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape closes dialog', !(await page.evaluate(() => document.querySelector('[data-project-dialog]').open)));
  check('focus returns to project link', await page.evaluate(() => document.activeElement.dataset.project === 'inva'));
  await page.close();
}

// Services: room viewer tabs
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'services.html');
  await page.focus('#tab-living');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  check('ArrowRight selects Bedroom tab', (await page.getAttribute('#tab-bedroom', 'aria-selected')) === 'true');
  check('panel text updates', (await page.textContent('[data-room-name]')) === 'Bedroom');
  check('panel specs update', (await page.$$eval('[data-room-specs] dt', (d) => d.map((x) => x.textContent))).join() === 'Design,Joinery,Lighting');
  await page.keyboard.press('End');
  await page.waitForTimeout(600);
  check('End selects Study', (await page.textContent('[data-room-name]')) === 'Study');
  await page.close();
}

// Process: FAQ
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'process.html');
  const faqs = await page.$$eval('.faq__item', (d) => d.length);
  check('FAQ has 5 questions', faqs === 5, `${faqs}`);
  await page.click('.faq__item:nth-child(2) summary');
  check('FAQ answer opens', await page.evaluate(() => document.querySelector('.faq__item:nth-child(2)').open));
  await page.close();
}

// Contact: enquiry form
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'contact.html');
  await page.click('[data-submit]');
  const errs = await page.$$eval('.field__error', (els) => els.filter((e) => e.textContent.trim()).length);
  check('empty form shows 7 errors', errs === 7, `${errs} errors`);
  check('focus moves to first invalid field', await page.evaluate(() => document.activeElement.id === 'f-name'));
  await page.fill('#f-name', 'Sara Al Mansoori');
  await page.fill('#f-phone', '12');
  await page.locator('#f-phone').blur();
  check('short phone flagged', (await page.textContent('#f-phone-error')).includes('valid phone'));
  await page.fill('#f-phone', '+971 52 142 4500');
  await page.fill('#f-email', 'sara@example');
  await page.locator('#f-email').blur();
  check('invalid email flagged', (await page.textContent('#f-email-error')).includes('valid email'));
  await page.fill('#f-email', 'sara@example.com');
  await page.selectOption('#f-type', 'Commercial');
  await page.fill('#f-location', 'Business Bay, Dubai');
  await page.fill('#f-message', 'Office fit-out for a team of 30, moving in next quarter.');
  await page.check('input[name="contactMethod"][value="Email"]', { force: true });
  check('optional fields left blank', (await page.inputValue('#f-company')) === '' && (await page.inputValue('#f-area')) === '');
  check('success hidden before submit', await page.isHidden('[data-form-success]'));
  await page.click('[data-submit]');
  await page.waitForTimeout(1300);
  check('success shown after valid submit', await page.isVisible('[data-form-success]'));
  check('form hidden after submit', await page.isHidden('[data-form]'));
  check('success greets by first name', (await page.textContent('[data-success-name]')) === ', Sara');
  await page.click('[data-form-reset]');
  check('reset restores empty form', (await page.isVisible('[data-form]')) && (await page.inputValue('#f-name')) === '');
  await page.close();
}

// Mobile: menu and layout
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'index.html');
  await page.click('[data-menu-toggle]');
  await page.waitForTimeout(900);
  check('mobile menu opens', (await page.getAttribute('[data-menu-toggle]', 'aria-expanded')) === 'true' && (await page.isVisible('#mobile-menu')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  check('Escape closes mobile menu', (await page.getAttribute('[data-menu-toggle]', 'aria-expanded')) === 'false' && (await page.isHidden('#mobile-menu')));
  await page.click('[data-menu-toggle]');
  await page.waitForTimeout(900);
  await Promise.all([page.waitForURL(/about\.html/), page.click('#mobile-menu a[href="about.html"]')]);
  check('menu link opens another page', page.url().includes('about.html'));
  for (const path of PAGES) {
    await open(page, path);
    check(`${path}: no horizontal overflow on mobile`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.close();
}

console.log(results.join('\n'));
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
