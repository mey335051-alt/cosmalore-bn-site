/**
 * parse-references.js
 * ----------------------------------------------------------------
 * موقع build روی HTML خام هر مقاله (خروجی wp.js) اجرا می‌شه.
 * ورودی: HTML مقاله که شماره‌های منبع به شکل قدیمی پلاگین وردپرسی
 *         نوشته شده‌ن: <sup class="ref"><a href="URL" title="عنوان|نویسنده|سال">1</a></sup>
 *
 * خروجی: { html, references }
 *   - html: همون محتوا ولی href/title کاملاً حذف شده و فقط یه
 *           <button data-ref="n"> جایگزینش شده — یعنی نه در HTML اولیه
 *           و نه با هاور موس، آدرس مقصد جایی دیده نمی‌شه.
 *   - references: آرایه‌ای {n, title, author, year, url, domain}
 *           که فقط داخل یه JSON جدا (نه روی تگ) به کامپوننت پاپ‌آپ داده می‌شه.
 * ----------------------------------------------------------------
 */

export function parseReferences(rawHtml) {
  const references = {};
  const occurrenceCounts = {};
  let autoCounter = 0;

  // نکته‌ی حیاتی: بین <sup class="ref"> و <a>، و بین </a> و </sup>، گاهی
  // خودِ وردپرس (wpautop) به‌خاطر خط جدید توی سورس، یه <br /> اضافه
  // می‌کنه. \s* فقط فاصله/خط‌جدید رو می‌گیره، نه یه تگ HTML مثل <br /> —
  // برای همین وقتی این <br> وجود داشت، کل رجکس شکست می‌خورد و اون
  // مرجع خاص دست‌نخورده (به‌شکل لینک خام) می‌موند. GAP زیر همون‌جاهاست
  // که هم فاصله‌ی معمولی و هم صفر یا چند <br> رو با هم قبول می‌کنه.
  const GAP = "(?:\\s|<br\\s*/?>)*";
  const html = rawHtml.replace(
    new RegExp(
      `<sup[^>]*class=["']ref["'][^>]*>${GAP}<a\\s+([^>]*?)>([\\s\\S]*?)<\\/a>${GAP}<\\/sup>`,
      "gi"
    ),
    (_match, attrs, inner) => {
      const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
      const titleMatch = attrs.match(/title=["']([^"']*)["']/i);

      const url = hrefMatch ? hrefMatch[1] : "";
      const parts = (titleMatch ? titleMatch[1] : "").split("|");
      const textNum = inner.replace(/\D/g, "");
      const isNew = /^\d+$/.test((parts[0] || "").trim());

      const n = isNew ? parts[0].trim() : textNum || String(++autoCounter);
      const title = (parts[isNew ? 1 : 0] || "").trim();
      const author = (parts[isNew ? 2 : 1] || "").trim();
      const year = (parts[isNew ? 3 : 2] || "").trim();

      let domain = "";
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* لینک نامعتبر یا خالی → منبع بدون لینک (چاپی) */
      }

      // hasLink مشخص می‌کنه منبع دیجیتاله (سایت/مقاله با آدرس واقعی) یا
      // چاپیه (کتاب/مجله و مثل آن — بدون url معتبر). این فیلد هم روی
      // خودِ نشانگر داخل متن (کلاس ref-marker--book) و هم روی کارت
      // پاپ‌آپ استفاده می‌شه تا ظاهر این دو نوع منبع کاملاً از هم جدا باشه.
      const hasLink = Boolean(domain);

      if (!references[n]) {
        references[n] = { n, title, author, year, url, domain, hasLink };
      }

      // هر بار همین شماره توی متن تکرار بشه، یه occurrence index جدید
      // می‌گیره تا بعداً فلش‌های برگشت (↑) دقیقاً به همون نقطه اشاره کنن.
      const occIndex = occurrenceCounts[n] || 0;
      occurrenceCounts[n] = occIndex + 1;

      // نکته‌ی کلیدی: هیچ href یا url‌ای در خروجی نمی‌مونه.
      // فقط شماره‌ی مرجع به‌صورت data-ref روی یه <button> باقی می‌مونه.
      // کلاس ref-marker--book از همین‌جا، موقع build، روی نشانگرهای
      // منابع چاپی می‌شینه (نیازی به تشخیص در جاوااسکریپت سمت مرورگر نیست).
      const markerClass = hasLink ? "ref-marker" : "ref-marker ref-marker--book";
      return `<sup class="ref"><button type="button" class="${markerClass}" id="refOcc-${n}-${occIndex}" data-ref="${n}" data-haslink="${hasLink ? 1 : 0}">(${n})</button></sup>`;
    }
  );

  const referencesArr = Object.values(references).map((r) => ({
    ...r,
    occurrences: occurrenceCounts[r.n] || 1,
  }));

  return { html, references: referencesArr };
}
