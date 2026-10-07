import { defineConfig } from "astro/config";

export default defineConfig({
  // خروجی کاملاً استاتیک برای بیشترین سرعت روی Cloudflare Pages
  output: "static",
  site: "https://cosmalore.com",
  // صریحاً با build.format: "directory" هماهنگ می‌کنیم — یعنی آدرس
  // canonical هر صفحه همیشه اسلش پایانی داره. این همون چیزی بود که
  // چون همه‌جا رعایت نمی‌شد (نقشه‌ی سایت، کارت‌های مقالات مرتبط،
  // جستجو)، باعث ریدایرکت ۳۰۱ مداوم و مشکل «Page with redirect» در
  // گوگل سرچ کنسول می‌شد.
  trailingSlash: "always",
  build: {
    format: "directory",
    inlineStylesheets: "auto",
  },
});
