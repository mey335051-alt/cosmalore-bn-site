export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      url.pathname = "/bn";
      return Response.redirect(url.toString(), 301);
    }

    // مسیرهای «داینامیک» وردپرس: ادمین، API، لاگین، کران و غیره. این‌ها
    // هرگز نباید کش بشن، چون محتواشون بسته به کاربر/زمان فرق می‌کنه.
    const wordpressDynamicPatterns = [
      "/bn/wp-admin",
      "/bn/wp-login.php",
      "/bn/wp-json",
      "/bn/wp-includes",
      "/bn/xmlrpc.php",
      "/bn/wp-cron.php",
      "/cpanel",
    ];

    if (wordpressDynamicPatterns.some((p) => url.pathname.startsWith(p))) {
      return fetch(request, {
        cf: { resolveOverride: "origin-direct.cosmalore.com" },
      });
    }

    // فایل‌های رسانه (تصاویر مقالات) عملاً هیچ‌وقت بعد از آپلود عوض
    // نمی‌شن؛ برای همین این مسیر رو از بقیه جدا کردیم تا لبه‌ی کلادفلر
    // یه نسخه‌ی کش‌شده نگه داره و دیگه هر بازدید مستقیم به هاست
    // اشتراکی نره — همین باعث کند بودن لود تصویر مقالات بود.
    if (url.pathname.startsWith("/bn/wp-content")) {
      return fetch(request, {
        cf: {
          resolveOverride: "origin-direct.cosmalore.com",
          cacheEverything: true,
          cacheTtl: 2592000, // ۳۰ روز
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
