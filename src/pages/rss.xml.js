import { getAllPosts } from "../lib/wp.js";

export async function GET({ site }) {
  const posts = await getAllPosts();
  const latest = posts.slice(0, 20);

  const items = latest
    .map((post) => {
      const url = new URL(post.path || post.slug, site).href;
      return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description><![CDATA[${post.excerpt}]]></description>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Cosmalore</title>
    <link>${site}</link>
    <description>Cosmalore বিশ্বকোষের সাম্প্রতিক নিবন্ধ</description>
    <language>bn</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
