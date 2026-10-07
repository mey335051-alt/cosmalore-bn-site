// ابزار قالب‌بندی — ارقام بنگالی (۰-۹ → ০-৯)
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBengaliNum(n) {
  return String(n)
    .split("")
    .map((c) => (/\d/.test(c) ? BN_DIGITS[+c] : c))
    .join("");
}
