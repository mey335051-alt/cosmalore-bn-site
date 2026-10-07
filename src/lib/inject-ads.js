// src/lib/inject-ads.js  (نسخه ۲)
// تزریق هوشمند تبلیغ درون‌مقاله‌ای در زمان build، روی HTML نهایی مقاله.
//
// قواعد:
//  • فقط پاراگراف‌های «سطح اول» شمرده می‌شوند (نه داخل infobox، جدول، لیست، نقشه و ...).
//  • مقاله کوتاه (۳ تا ۵ پاراگراف): یک تبلیغ، بعد از اولین h2 و بعد از پایان infobox
//    (بعد از اولین پاراگراف همان بخش، نه چسبیده به خود تیتر).
//  • مقاله بلند (۶+): تبلیغ اول بعد از infobox، سپس بعد از پاراگراف‌های ۴، ۷، ۱۰، ۱۵، ۲۲ و ...
//  • هر تبلیغ فقط در «مرز امن» می‌آید: بعد از پایان یک پاراگراف که
//      - با «:» تمام نشده باشد (مقدمه‌ی لیست/جدول است)،
//      - عنصر بعدی‌اش جدول/لیست/تصویر/نقشه/iframe/باکس نباشد.
//    اگر مرز امن نبود، تا ۲ پاراگراف بعدتر جابه‌جا می‌شود.
//  • فاصله‌ی حداقلی بین دو تبلیغ (پاراگراف و تعداد کلمه)، و دور از انتهای مقاله (ویجت پایین).
//  • سقف تعداد بر اساس طول مقاله (تقریباً یک تبلیغ برای هر ۳۰۰ کلمه) و maxAds.

const AFTER_PARAGRAPH = [4, 7, 10, 15, 22, 31, 42, 55, 70, 87]; // تا ۱۰۰

const CONTAINERS = new Set([
  "table", "div", "ul", "ol", "blockquote", "details", "figure", "aside", "section",
]);

const MIN_PARAGRAPH_CHARS = 30;   // پاراگراف خالی/فقط «.» شمرده نمی‌شود
const IB_MARKER = /class=["'][^"']*\bib-(?:sec|row|label|val|foot)\b/i;

const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const stripTags = (s) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");

export function injectInArticleAds(
  html,
  {
    widgetId,
    maxAds = 5,            // سقف مطلق تبلیغ درون‌مقاله‌ای
    wordsPerAd = 300,      // حداقل کلمه به‌ازای هر تبلیغ (تعیین‌کننده‌ی سقف واقعی)
    minGapParas = 3,       // حداقل پاراگراف بین دو تبلیغ
    minGapWords = 120,     // حداقل کلمه بین دو تبلیغ
    tailParas = 2,         // چند پاراگراف آخر مقاله بدون تبلیغ می‌ماند
    tailWords = 120,       // و حداقل چند کلمه تا انتهای مقاله
    shortLimit = 6,        // کمتر از این تعداد پاراگراف = «مقاله کوتاه»
    label = "বিজ্ঞাপন",
  } = {}
) {
  if (!html || !widgetId) return html;

  // ---- ۱) پیمایش تگ‌ها: پاراگراف‌های سطح اول، اولین h2، محدوده‌ی infobox ----
  const re = /<(\/?)(p|h2|table|div|ul|ol|blockquote|details|figure|aside|section)\b[^>]*>/gi;
  const paras = []; // { start, end, words, colon }
  let depth = 0, pStart = -1, topStart = -1;
  let firstH2 = -1, infoboxEnd = -1;
  let m;

  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();

    if (CONTAINERS.has(tag)) {
      if (!closing) {
        if (depth === 0) topStart = m.index;
        depth += 1;
      } else if (depth > 0) {
        depth -= 1;
        if (depth === 0 && topStart !== -1) {
          const end = m.index + m[0].length;
          if (infoboxEnd === -1 && IB_MARKER.test(html.slice(topStart, end))) infoboxEnd = end;
          topStart = -1;
        }
      }
    } else if (tag === "h2") {
      if (!closing && depth === 0 && firstH2 === -1) firstH2 = m.index;
    } else if (tag === "p" && depth === 0) {
      if (!closing) {
        pStart = m.index;
      } else if (pStart !== -1) {
        const end = m.index + m[0].length;
        const text = stripTags(html.slice(pStart, end)).trim();
        if (text.length >= MIN_PARAGRAPH_CHARS) {
          paras.push({ start: pStart, end, words: words(text), colon: /[:：]$/.test(text) });
        }
        pStart = -1;
      }
    }
  }

  const n = paras.length;
  if (n < 3) return html; // خیلی کوتاه یا ساختار ناشناخته → بدون تبلیغ

  const totalWords = paras.reduce((s, p) => s + p.words, 0);
  const cap = Math.max(1, Math.min(maxAds, Math.floor(totalWords / wordsPerAd)));

  // پس‌ثبت‌ها: کلمات تجمعی تا پایان هر پاراگراف
  const cum = [];
  paras.reduce((s, p, i) => (cum[i] = s + p.words), 0);

  // بعد از موقعیت pos چه عنصری می‌آید؟ فقط p / h2 / h3 / h4 (یا انتهای محتوا) امن است
  const nextIsSafe = (pos) => {
    const next = /^(?:\s|<br\s*\/?>)*<([a-z0-9]+)/i.exec(html.slice(pos, pos + 200));
    if (!next) return true;
    return ["p", "h2", "h3", "h4"].includes(next[1].toLowerCase());
  };

  const isShort = n < shortLimit;

  // ---- ۲) انتخاب جایگاه‌ها: هر جایگاه { i: اندیس پاراگراف مرجع، pos: موقعیت درج } ----
  const chosen = [];
  const canPlace = (i) => {
    if (isShort) {
      if (i > n - 2) return false; // حداقل یک پاراگراف تا انتها بماند
    } else {
      if (i > n - 1 - tailParas) return false;
      if (totalWords - cum[i] < tailWords) return false;
    }
    const last = chosen.length ? chosen[chosen.length - 1].i : -1;
    if (last !== -1) {
      if (i - last < minGapParas) return false;
      if (cum[i] - cum[last] < minGapWords) return false;
    }
    return true;
  };
  // بعد از پایان پاراگراف i (و اگر لازم شد تا ۲ پاراگراف بعدتر)
  const tryAfterPara = (i0) => {
    for (let i = i0; i <= i0 + 2 && i < n; i++) {
      if (i < 0 || paras[i].colon) continue;
      if (canPlace(i) && nextIsSafe(paras[i].end)) {
        chosen.push({ i, pos: paras[i].end });
        return true;
      }
    }
    return false;
  };
  // اولین پاراگراف که بعد از pos شروع می‌شود
  const idxAfter = (pos) => paras.findIndex((p) => p.start >= pos);

  if (isShort) {
    // مقاله کوتاه: بعد از اولین h2 و بعد از پایان infobox
    const minPos = Math.max(infoboxEnd, firstH2);
    let i = minPos === -1 ? 1 : idxAfter(minPos);
    if (i === -1) i = n - 2;
    tryAfterPara(i);
  } else {
    // مقاله بلند: تبلیغ اول درست بعد از infobox (اگر نبود، بعد از اولین پاراگراف)
    if (infoboxEnd !== -1 && nextIsSafe(infoboxEnd)) {
      const before = idxAfter(infoboxEnd);
      const iRef = (before === -1 ? n : before) - 1; // آخرین پاراگراف پیش از infobox
      if (iRef >= 0 && canPlace(iRef)) chosen.push({ i: iRef, pos: infoboxEnd });
    }
    if (!chosen.length) tryAfterPara(0);
    for (const k of AFTER_PARAGRAPH) {
      if (chosen.length >= cap) break;
      tryAfterPara(k - 1);
    }
  }

  if (!chosen.length) return html;
  const positions = chosen.slice(0, cap).map((c) => c.pos);

  const ad =
    `<aside class="csm-ad csm-ad-inarticle" aria-label="${label}">` +
    `<span class="csm-ad-label">${label}</span>` +
    `<div class="JC-WIDGET-DMROOT" data-widget-id="${widgetId}"></div>` +
    `</aside>`;

  let out = html;
  for (const pos of positions.sort((a, b) => b - a)) {
    out = out.slice(0, pos) + ad + out.slice(pos);
  }
  return out;
}
