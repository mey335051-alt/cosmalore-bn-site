import { getAllPosts } from "../lib/wp.js";

export async function GET({ site }) {
  const posts = await getAllPosts();

  const staticPages = ["", "about", "contact", "editorial-policy", "privacy", "terms", "disclaimer", "search"];

  const staticUrls = staticPages.map((p) => {
    // "" (خودِ ریشه) رو دست‌نخورده می‌ذاریم؛ بقیه‌ی صفحات ثابت هم مثل
    // صفحات مقاله با build.format: "directory" ساخته می‌شن، پس همون
    // نیاز به اسلش پایانی رو دارن.
    const loc = p ? new URL(p + "/", site).href : new URL(p, site).href;
    return `  <url><loc>${loc}</loc></url>`;
  });

  // تاریخ خام وردپرس (مثل "2026-08-28T12:34:56") فاقد آفست زمانی/Z
  // است و استاندارد W3C sitemap این فرمت رو نامعتبر می‌دونه. اینجا
  // به ISO 8601 کامل تبدیلش می‌کنیم؛ اگه تاریخ نامعتبر یا خالی بود،
  // به‌جای فرستادن رشته‌ی خراب، کلاً تگ <lastmod> رو حذف می‌کنیم.
  const toIsoDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const postUrls = posts
    .filter((post) => post.path || post.slug)
    .map((post) => {
      // نکته‌ی رفع مشکل ایندکس گوگل: build.format این پروژه "directory"ه،
      // یعنی آدرس canonical واقعی هر مقاله همیشه اسلش پایانی داره. قبلاً
      // این‌جا اسلش رو نمی‌ذاشتیم، یعنی خودِ sitemap.xml — منبع اصلی
      // کشف مقاله‌ها برای گوگل — به نسخه‌ی غلط (بدون اسلش) اشاره می‌کرد،
      // که همیشه یه ریدایرکت ۳۰۱ می‌خورد. همین چیزیه که در Search Console
      // به‌صورت «Page with redirect» دیده می‌شد.
      const loc = new URL((post.path || post.slug) + "/", site).href;
      const lastmod = toIsoDate(post.date);
      return lastmod
        ? `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
        : `  <url>\n    <loc>${loc}</loc>\n  </url>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join("\n")}
${postUrls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

