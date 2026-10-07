/**
 * build-search-index.js
 * ----------------------------------------------------------------
 * موقع build اجرا می‌شه، همه‌ی مقالات رو از وردپرس می‌گیره و یه
 * فایل سبک JSON فقط با فیلدهای لازم برای جستجو می‌سازه.
 * این فایل توی public/ قرار می‌گیره تا مرورگر کاربر مستقیم
 * بتونه بدون هیچ درخواستی به وردپرس، جستجو رو محلی انجام بده.
 * ----------------------------------------------------------------
 */
import { getAllPosts } from "./wp.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// یکسان‌سازی متن بنگالی برای جستجو: NFC (ترکیب/تجزیه‌ی یونیکد، مثل ড়/য়)،
// حذف ZWJ/ZWNJ و تبدیل ارقام بنگالی (০-৯) به لاتین (0-9). عنوان واقعی
// مقاله دست‌نخورده نمایش داده می‌شه، فقط تطبیق روی نسخه‌ی یکسان‌شده
// انجام می‌شه.
export function normalizeBengali(str) {
  return (str || "")
    .toString()
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u09E6-\u09EF]/g, function (d) { return String(d.charCodeAt(0) - 0x09E6); })
    .toLowerCase()
    .trim();
}

export async function buildSearchIndex(outputDir = "public") {
  const posts = await getAllPosts();

  const index = posts.map((post) => ({
    slug: post.slug,
    path: post.path,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category?.name || "",
    image: post.image,
    // نسخه‌ی یکسان‌شده — فقط برای جستجو، هیچ‌جا نمایش داده نمی‌شه
    nt: normalizeBengali(post.title),
    ne: normalizeBengali(post.excerpt),
    nc: normalizeBengali(post.category?.name || ""),
  }));

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "search-index.json"),
    JSON.stringify(index),
    "utf-8"
  );

  console.log(`✓ search-index.json ساخته شد (${index.length} مقاله)`);
}

// اجرای مستقیم: node src/lib/build-search-index.js
if (import.meta.url === `file://${process.argv[1]}`) {
  buildSearchIndex().catch((err) => {
    console.error("خطا در ساخت ایندکس جستجو:", err);
    process.exit(1);
  });
}
