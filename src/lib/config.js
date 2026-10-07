// تنظیمات مشترک پروژه
export const PAGE_SIZE = 20; // تعداد مقاله در هر صفحه از فهرست اصلی

// ویجت تبلیغات ناتیو جبنا (پایین هر صفحه‌ی مقاله)
export const JUBNA_WIDGET_ID = "d2bddbcdd1de189b711d0f77bd47f186";

// ویجت تک‌کارتی جبنا برای وسط مقاله (تزریق خودکار با src/lib/inject-ads.js)
export const JUBNA_INARTICLE_WIDGET_ID = "83d8e66b4972e97380730cb4724a8447";

// کلید کلی تبلیغات. false = هیچ ویجت تبلیغاتی (جبنا) در صفحه‌ها نمایش داده
// نمی‌شه و هیچ اسکریپت تبلیغاتی لود نمی‌شه. وقتی AdSense یا شبکه‌ی دیگه‌ای
// برای نسخه‌ی بنگالی آماده شد، این رو true کنید و ویجت جدید بذارید.
export const ADS_ENABLED = false;
