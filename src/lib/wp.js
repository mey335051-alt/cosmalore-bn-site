/**
 * wp.js
 * ----------------------------------------------------------------
 * لایه‌ی اتصال به REST API وردپرس. همه‌ی این توابع فقط موقع
 * `astro build` اجرا می‌شن (نه در مرورگر کاربر نهایی).
 *
 * پیش‌نیاز: آدرس زیر باید در دسترس و عمومی باشه:
 *   https://cosmalore.com/bn/wp-json/wp/v2/posts
 *
 * سه فیکس مهمی که امروز حین تست روی cosmalore.com کشف شدن:
 * ۱) بدون هدر User-Agent شبیه مرورگر، بعضی هاست‌ها به‌جای JSON یه
 *    صفحه‌ی HTML چالش/خطا برمی‌گردونن.
 * ۲) این هاست خاص گاهی ۳۰-۴۰ ثانیه طول می‌کشه یا موقتاً throttle
 *    می‌شه؛ بدون timeout و تلاش مجدد، build ممکنه گیر کنه یا شکست بخوره.
 * ۳) مقالاتی که اسلاگشون از عنوان عربی خودکار ساخته شده، توی وردپرس
 *    به‌صورت درصدی/percent-encoded ذخیره می‌شن (مثل %d9%85%d8%b9...).
 *    دیکدش می‌کنیم تا متن عربی واقعی به دست بیاد و Astro بتونه مسیر
 *    استاتیک درست بسازه (قبلاً این مقالات کلاً رد می‌شدن؛ الان نمایش
 *    داده می‌شن).
 * ----------------------------------------------------------------
 */

// TODO: با آدرس واقعی وردپرس‌تون جایگزین کنید
const WP_BASE_URL = "https://cosmalore.com/bn/wp-json/wp/v2";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "bn,en-US;q=0.9,en;q=0.8",
};

const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;

async function wpFetch(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (attempt >= MAX_RETRIES) {
      throw new Error(
        `اتصال به وردپرس ناموفق بود بعد از ${MAX_RETRIES} تلاش (${e.message}). ممکنه هاست موقتاً کند/محدود شده باشه.`
      );
    }
    const waitMs = attempt * 5000;
    console.warn(`[wp.js] تلاش ${attempt} ناموفق (${e.message})؛ ${waitMs / 1000}s صبر و تلاش دوباره...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return wpFetch(url, attempt + 1);
  }
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ⚠️ مسیر کش: Cloudflare (Pages و Workers Builds) از بین پوشه‌های پروژه فقط
// node_modules/.astro رو بین بیلدها نگه می‌داره. قبلاً کش توی ریشه‌ی پروژه
// (.wp-cache.json) بود و بعد از هر بیلد دور ریخته می‌شد، یعنی هر بیلد همه‌ی
// مقاله‌ها رو از اول از وردپرس می‌کشید. حالا کش داخل پوشه‌ای می‌ره که
// Cloudflare ذخیره‌ش می‌کنه تا بیلدهای بعدی فقط مقاله‌های تازه رو بکشن.
// (فعال بودن «Build cache» در تنظیمات Cloudflare لازمه.)
const CACHE_DIR = path.join(__dirname, "..", "..", "node_modules", ".astro", "cosmalore");
const CACHE_PATH = path.join(CACHE_DIR, "wp-cache.json");
// اگه ساختار normalizePost عوض شد، این عدد رو بالا ببرید تا کش قدیمی دور ریخته شه.
const CACHE_VERSION = 2;

function loadCache() {
  const empty = { fetchedAt: null, posts: {} };
  if (!existsSync(CACHE_PATH)) return empty;
  try {
    const c = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    // کش مال یه نسخه‌ی دیگه‌ی کد یا یه وردپرس دیگه (مثلاً /ar به‌جای /bn) بود؟ دورش بریز.
    if (c.version !== CACHE_VERSION || c.source !== WP_BASE_URL) return empty;
    return c;
  } catch {
    return empty;
  }
}

function saveCache(cache) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify({ ...cache, version: CACHE_VERSION, source: WP_BASE_URL }), "utf-8");
  } catch (e) {
    console.warn(`[wp.js] ذخیره‌ی کش محلی ممکن نشد (${e.message}) — دفعه‌ی بعد کامل دوباره کشیده می‌شه.`);
  }
}


// گرفتن یک صفحه از REST API با تلاش مجدد برای هر نوع خطای موقتی:
// کد 403/429/5xx، پاسخ خالی، یا پاسخی که JSON نیست (چالش فایروال).
// در هر شکست، اطلاعات تشخیصی در لاگ بیلد چاپ می‌شه تا علت معلوم بشه.
const PAGE_MAX_ATTEMPTS = 6;
const RETRYABLE_STATUSES = [403, 429, 500, 502, 503, 504];

async function fetchJsonPage(pageUrl, page) {
  let lastProblem = "";
  for (let attempt = 1; attempt <= PAGE_MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await wpFetch(pageUrl);
    } catch (e) {
      lastProblem = e.message;
      res = null;
    }
    if (res) {
      if (res.status === 400) return null;
      const text = await res.text();
      const h = (n) => res.headers.get(n) || "-";
      const diag =
        `status=${res.status} content-type=${h("content-type")} ` +
        `cf-mitigated=${h("cf-mitigated")} server=${h("server")} ` +
        `cf-ray=${h("cf-ray")} طول بدنه=${text.length} ` +
        `شروع بدنه="${text.slice(0, 120).replace(/\s+/g, " ")}"`;
      if (res.ok) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return parsed;
          lastProblem = `JSON آرایه نبود. ${diag}`;
        } catch {
          lastProblem = `پاسخ JSON نبود (احتمالاً فایروال/افزونه‌ی امنیتی). ${diag}`;
        }
      } else if (RETRYABLE_STATUSES.includes(res.status)) {
        lastProblem = `پاسخ موقتی. ${diag}`;
      } else {
        throw new Error(`خطا در گرفتن مقالات از وردپرس: ${diag}`);
      }
    }
    if (attempt < PAGE_MAX_ATTEMPTS) {
      const waitMs = attempt * 8000;
      console.warn(
        `[wp.js] صفحه ${page}، تلاش ${attempt}/${PAGE_MAX_ATTEMPTS} ناموفق: ${lastProblem}\n  ${waitMs / 1000}s صبر و تلاش دوباره...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(`گرفتن صفحه ${page} بعد از ${PAGE_MAX_ATTEMPTS} تلاش ناموفق بود. ${lastProblem}`);
}

// نکته‌ی مهم: این promise رو یه‌بار می‌سازیم و نگه می‌داریم (نه هر بار
// یه تابع جدید). چون همه‌ی صفحات (index، صفحه‌بندی، sitemap، rss،
// ایندکس جستجو، و getStaticPaths خود [slug].astro) توی **یک** فرآیند
// Node اجرا می‌شن (یعنی یک اجرای `astro build`)، وقتی چندجا همزمان
// getAllPosts() صدا زده بشه، همه به همین یک promise مشترک می‌رسن —
// یعنی به‌جای ۵-۶ بار گرفتن کامل لیست مقالات از وردپرس، فقط ۱ بار
// گرفته می‌شه، صرف‌نظر از تعداد فایل‌هایی که صداش می‌زنن.
let allPostsPromise = null;

export function getAllPosts() {
  if (!allPostsPromise) allPostsPromise = fetchAllPostsIncremental();
  return allPostsPromise;
}

async function pruneDeletedPosts(cache) {
  const live = new Set();
  let page = 1;
  while (true) {
    let res;
    try {
      res = await wpFetch(`${WP_BASE_URL}/posts?per_page=100&page=${page}&_fields=id`);
    } catch {
      return 0; // نتونستیم تأیید کنیم → کش دست‌نخورده می‌مونه
    }
    if (!res.ok) {
      if (res.status === 400 && page > 1) break; // بعد از آخرین صفحه
      return 0;
    }
    let batch;
    try { batch = await res.json(); } catch { return 0; }
    if (!Array.isArray(batch)) return 0;
    batch.forEach((p) => live.add(String(p.id)));
    if (batch.length < 100) break;
    page++;
  }
  // لیست خالی ولی کش پر؟ مشکوکه (مثلاً وردپرس موقتاً خراب بوده) — چیزی پاک نکن.
  if (live.size === 0) return 0;
  let removed = 0;
  for (const id of Object.keys(cache.posts)) {
    if (!live.has(String(id))) { delete cache.posts[id]; removed++; }
  }
  return removed;
}

async function fetchAllPostsIncremental() {
  // حالت تست سرعت (WP_POST_LIMIT): کش رو کاملاً نادیده می‌گیریم و فقط
  // همین تعداد مقاله رو تازه می‌گیریم — تا نتیجه‌ی build همیشه دقیقاً
  // همون N مقاله باشه، نه ترکیبی از کش قدیمی + جدید.
  const limit = Number(process.env.WP_POST_LIMIT) || null;
  if (limit) {
    const testPosts = [];
    let page = 1;
    while (testPosts.length < limit) {
      const res = await wpFetch(`${WP_BASE_URL}/posts?per_page=100&page=${page}&_embed`);
      if (!res.ok) break;
      const batch = await res.json();
      if (!batch.length) break;
      testPosts.push(...batch.map(normalizePost));
      if (batch.length < 100) break;
      page++;
    }
    testPosts.length = Math.min(testPosts.length, limit);
    console.log(`[wp.js] WP_POST_LIMIT=${limit} فعاله — فقط ${testPosts.length} مقاله برای تست کشیده شد (کش نادیده گرفته شد).`);
    return testPosts;
  }

  const cache = loadCache();
  const sinceParam = cache.fetchedAt ? `&modified_after=${encodeURIComponent(cache.fetchedAt)}` : "";
  // ۵ دقیقه هم‌پوشانی: اگه ساعت این ماشین با سرور وردپرس کمی فرق داشته باشه، مقاله‌ای جا نمی‌افته.
  const newFetchedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  let page = 1;
  const perPage = 30;
  let changedCount = 0;

  while (true) {
    const pageUrl = `${WP_BASE_URL}/posts?per_page=${perPage}&page=${page}&orderby=modified&order=desc${sinceParam}&_embed`;
    const batch = await fetchJsonPage(pageUrl, page);
    if (batch === null) break; // 400 = صفحه‌ی بعد از آخر
    if (!batch.length) break;
    for (const raw of batch) {
      cache.posts[raw.id] = normalizePost(raw);
      changedCount++;
    }
    if (batch.length < perPage) break;
    page++;
  }

  // فقط وقتی همه‌چیز بدون خطا تموم شد، تاریخ رو آپدیت می‌کنیم — اگه
  // یه‌جای وسط throw بشه، تاریخ قدیمی می‌مونه و دفعه‌ی بعد از همون‌جا
  // دوباره تلاش می‌شه (نه اینکه چیزی گم بشه).
  // مقاله‌ای که توی وردپرس حذف یا پیش‌نویس شده، با modified_after پیدا نمی‌شه؛
  // پس فقط لیست idها (خیلی سبک) رو می‌گیریم و موارد حذف‌شده رو از کش پاک می‌کنیم.
  if (cache.fetchedAt) {
    const removed = await pruneDeletedPosts(cache);
    if (removed > 0) console.log(`[wp.js] ${removed} مقاله‌ی حذف‌شده از کش پاک شد.`);
  }

  cache.fetchedAt = newFetchedAt;
  saveCache(cache);

  if (changedCount > 0) {
    console.log(`[wp.js] ${changedCount} مقاله‌ی جدید/تغییریافته از وردپرس کشیده شد.`);
  } else if (cache.fetchedAt) {
    console.log(`[wp.js] هیچ مقاله‌ی تغییریافته‌ای نبود — ${Object.keys(cache.posts).length} مقاله از کش محلی استفاده شد.`);
  }

  return Object.values(cache.posts).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ترتیب نمایش مقالات صفحه‌ی اصلی، که از پنل مدیریت (/admin/panel-ccb5f273)
// تنظیم می‌شه. اگه وردپرس در دسترس نبود یا مقداری ثبت نشده بود، حالت
// پیش‌فرض «جدیدترین» (که خودِ ترتیب پیش‌فرض API وردپرسه) اعمال می‌شه —
// یعنی خطای این تابع هرگز باعث شکست کل build نمی‌شه.
export async function getSiteSettings() {
  try {
    const res = await wpFetch(`${WP_BASE_URL.replace("/wp/v2", "")}/cosmalore/v1/settings`);
    if (!res.ok) return { sortOrder: "newest" };
    return await res.json();
  } catch {
    return { sortOrder: "newest" };
  }
}

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// وقتی sortOrder === "random" باشه استفاده می‌شه. عمداً seed رو از
// تاریخ امروز می‌سازیم (نه Math.random خام) تا توی یه build واحد،
// صفحه‌ی ۱ و صفحه‌ی ۲ و sitemap همه با هم هماهنگ باشن (یه مقاله دو بار
// تکراری یا کلاً جا نیفته)، و ترتیب فقط یک‌بار در روز عوض بشه، نه هر
// ثانیه.
export function applySortOrder(posts, sortOrder) {
  if (sortOrder !== "random") return posts;
  const daySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  return seededShuffle(posts, daySeed);
}

export async function getPostBySlug(slug) {
  const res = await wpFetch(`${WP_BASE_URL}/posts?slug=${encodeURIComponent(slug)}&_embed`);
  if (!res.ok) throw new Error(`خطا در گرفتن مقاله «${slug}»: ${res.status}`);
  const results = await res.json();
  if (!results.length) return null;
  return normalizePost(results[0]);
}

// این دو تابع قبلاً برای هر مقاله، ۲ درخواست زنده‌ی جدا به وردپرس
// می‌زدن — یعنی با ۵۰۰ مقاله، ۱۰۰۰+ درخواست اضافه که خودشون باعث
// کندی build می‌شدن. حالا از همون لیست کامل posts (که یه‌بار در
// حافظه داریم) محاسبه می‌شن — صفر درخواست شبکه‌ی اضافه.
export function getRelatedPosts(allPosts, categoryId, excludeId, limit = 4) {
  if (!categoryId) return [];
  return allPosts.filter((p) => p.categoryId === categoryId && p.id !== excludeId).slice(0, limit);
}

export function getRandomPosts(allPosts, excludeId, limit = 6) {
  return allPosts.filter((p) => p.id !== excludeId).slice(0, limit);
}

function normalizePost(raw) {
  const embedded = raw._embedded || {};
  const featuredMedia = embedded["wp:featuredmedia"]?.[0];
  const terms = embedded["wp:term"]?.[0] || [];
  const category = terms[0];

  const sizes = featuredMedia?.media_details?.sizes || {};
  const srcsetParts = Object.values(sizes)
    .filter((s) => s?.source_url && s?.width)
    .map((s) => `${s.source_url} ${s.width}w`);
  const imageSrcset = srcsetParts.length ? srcsetParts.join(", ") : null;

  return {
    id: raw.id,
    slug: safeDecodeSlug(raw.slug),
    // آدرس کامل مقاله دقیقاً مطابق ساختار فعلی وردپرس (مثل
    // bn/2026/08/28/example-post)، بدون اسلش ابتدا/انتها.
    // این فیلد جدیده و کنار slug قدیمی نگه داشته می‌شه (نه جایگزینش).
    path: buildPathFromLink(raw.link),
    title: decodeEntities(raw.title?.rendered || ""),
    excerpt: extractManualExcerpt(raw.excerpt?.rendered || ""),
    content: formatCitationMarkers(raw.content?.rendered || ""),
    date: raw.date,
    image: featuredMedia?.source_url || null,
    imageSrcset,
    imageAlt: featuredMedia?.alt_text || "",
    category: category ? { id: category.id, name: category.name } : null,
    categoryId: category?.id || null,
  };
}
// شماره‌ی منابع همیشه اینجا (نه در محتوای خام وردپرس) به شکل نهایی
// درمیاد — یعنی هم مقالات قدیمی که با فرمت [N] نوشته شدن، هم مقالات
// جدید، در نمایش نهایی همیشه یکسان و به‌صورت (N) دیده می‌شن، بدون
// نیاز به ویرایش دستی هیچ مقاله‌ای. فقط داخل <sup class="ref">...</sup>
// عمل می‌کنه تا هیچ براکت دیگه‌ای تو متن مقاله (اگه جایی باشه) دست
// نخوره.
function formatCitationMarkers(html) {
  return html.replace(
    /(<sup\s+class="ref">\s*<a\b[^>]*>)\s*\[(\d+)\]\s*(<\/a>\s*<\/sup>)/g,
    "$1($2)$3"
  );
}
// raw.link نمونه‌اش چیزی مثل "https://cosmalore.com/bn/2026/08/28/xyz/"
// است. فقط مسیر (بدون دامنه) رو نگه می‌داریم، و چون بعضی بخش‌های مسیر
// (نه فقط اسلاگ آخر) ممکنه عربی/percent-encoded باشن، تک‌تک بخش‌ها رو
// جدا دیکد می‌کنیم، نه کل رشته رو یه‌جا.
function buildPathFromLink(link) {
  if (!link) return null;
  try {
    const { pathname } = new URL(link);
    return pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment; // اگه دیکد شکست خورد، همون بخش خام رو نگه می‌داریم
        }
      })
      .join("/");
  } catch {
    return null; // raw.link نامعتبر بود؛ صفحه‌های وابسته به path این مقاله رو نادیده می‌گیرن
  }
}

function safeDecodeSlug(slug) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").trim();
}

// وقتی نویسنده فیلد «وصف مختصر» رو خالی می‌ذاره، خودِ وردپرس یه excerpt
// خودکار از ابتدای متن مقاله می‌سازه و همیشه با یه لینک «اقرأ المزيد»
// (more-link) تمومش می‌کنه — این امضای ثابتیه که فقط توی حالت خودکار
// اضافه می‌شه، نه وقتی نویسنده خودش چیزی نوشته. اگه این امضا رو ببینیم،
// یعنی توضیح مختصرِ واقعی‌ای وجود نداره و باید رشته‌ی خالی برگردونیم —
// نه اینکه بخشی از خودِ مقاله رو به‌جای توضیح مختصر نشون بدیم.
const AUTO_EXCERPT_SIGNATURE = /class=["']more-link["']|আরও\s*পড়ুন|Continue\s*reading|Read\s*more/i;

function extractManualExcerpt(rawExcerptHtml) {
  if (!rawExcerptHtml || AUTO_EXCERPT_SIGNATURE.test(rawExcerptHtml)) return "";
  return stripHtml(decodeEntities(rawExcerptHtml));
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&#8230;/g, "…");
    }
