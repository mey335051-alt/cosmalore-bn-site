/**
 * auth.js
 * ----------------------------------------------------------------
 * لایه‌ی ارتباط با پلاگین سفارشی «Cosmalore Auth & Saved Articles».
 * برخلاف wp.js، این فایل توی مرورگر خود کاربر اجرا می‌شه (نه موقع
 * build)، چون ورود/ثبت‌نام باید لحظه‌ای باشه.
 *
 * این آدرس‌ها با پلاگین اختصاصی cosmalore-auth.php جفت شدن — نیازی
 * به نصب هیچ افزونه‌ی JWT شخص‌ثالثی نیست.
 * ----------------------------------------------------------------
 */

// TODO: با آدرس واقعی وردپرس‌تون جایگزین کنید (همون که در wp.js گذاشتید)
const WP_SITE = "https://cosmalore.com/bn";
const LOGIN_ENDPOINT = `${WP_SITE}/wp-json/cosmalore/v1/auth`;
const REGISTER_ENDPOINT = `${WP_SITE}/wp-json/cosmalore/v1/users`;
const SAVED_ENDPOINT = `${WP_SITE}/wp-json/cosmalore/v1/saved`;
const SETTINGS_ENDPOINT = `${WP_SITE}/wp-json/cosmalore/v1/settings`;

const TOKEN_KEY = "cosmalore_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(email, password) {
  const res = await fetch(LOGIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "ইমেইল বা পাসওয়ার্ড ভুল।");
  }
  localStorage.setItem(TOKEN_KEY, data.data.jwt);
  return data.data;
}

export async function register(email, password, name) {
  const res = await fetch(REGISTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, user_login: email, display_name: name }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "নিবন্ধন করা যায়নি। এই ইমেইল হয়তো আগেই নিবন্ধিত।");
  }
  // بعد از ثبت‌نام موفق، خودکار وارد می‌شیم
  return login(email, password);
}

export async function getSavedArticles() {
  const token = getToken();
  if (!token) return [];
  const res = await fetch(SAVED_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function saveArticle(postId) {
  const token = getToken();
  if (!token) throw new Error("নিবন্ধ সংরক্ষণ করতে আগে লগইন করুন।");
  const res = await fetch(SAVED_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ post_id: postId }),
  });
  if (!res.ok) throw new Error("নিবন্ধ সংরক্ষণ করা যায়নি।");
  return res.json();
}

export async function unsaveArticle(postId) {
  const token = getToken();
  if (!token) throw new Error("এটি করতে আগে লগইন করুন।");
  const res = await fetch(`${SAVED_ENDPOINT}/${postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("সংরক্ষিত তালিকা থেকে সরানো যায়নি।");
  return res.json();
}

// تنظیمات سراسری سایت (فعلاً فقط ترتیب نمایش مقالات) — GET برای همه
// آزاده (خودِ Astro هم موقع build ازش می‌خونه)، POST فقط برای کاربر
// مدیر (نقش manage_options در وردپرس) با همون توکن ورود کار می‌کنه.
export async function getSettings() {
  const res = await fetch(SETTINGS_ENDPOINT);
  if (!res.ok) return { sortOrder: "newest" };
  return res.json();
}

export async function updateSettings(sortOrder) {
  const token = getToken();
  if (!token) throw new Error("সেটিং বদলাতে আগে অ্যাডমিন অ্যাকাউন্টে লগইন করুন।");
  const res = await fetch(SETTINGS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sortOrder }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "সেটিং পরিবর্তন করা যায়নি।");
  }
  return data;
}

const FORGOT_PASSWORD_ENDPOINT = `${WP_SITE}/wp-json/cosmalore/v1/forgot-password`;
const RESET_PASSWORD_ENDPOINT = `${WP_SITE}/wp-json/cosmalore/v1/reset-password`;

// همیشه یه پیام موفقیت‌آمیز یکسان برمی‌گردونه (چه ایمیل وجود داشته
// باشه چه نه) — این عمداً برای جلوگیری از لو رفتن اینکه کدوم ایمیل‌ها
// توی سایت ثبت‌نام شدن (User Enumeration) هست.
export async function requestPasswordReset(email) {
  await fetch(FORGOT_PASSWORD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).catch(() => {});
}

export async function resetPassword(login, key, password) {
  const res = await fetch(RESET_PASSWORD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, key, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "পাসওয়ার্ড রিসেট করা যায়নি। লিঙ্কটির মেয়াদ হয়তো শেষ হয়ে গেছে।");
  }
  return data;
}
