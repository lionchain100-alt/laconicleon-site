import { getCollection } from 'astro:content';

export async function GET() {
  const posts = (await getCollection('posts')).filter((post) => !post.data.draft).sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
  const escape = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character] || character));
  const items = posts.map((post) => `<item><title>${escape(post.data.title)}</title><link>https://laconicleon.com/writing/${post.id}</link><guid>https://laconicleon.com/writing/${post.id}</guid><description>${escape(post.data.description)}</description><pubDate>${post.data.publishedAt.toUTCString()}</pubDate></item>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>laconicleon — Leon Reed / 简练</title><link>https://laconicleon.com</link><description>Notes, systems, and things worth making.</description>${items}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
