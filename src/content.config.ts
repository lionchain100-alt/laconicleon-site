import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const posts = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }), schema: z.object({ title: z.string(), description: z.string(), publishedAt: z.coerce.date(), draft: z.boolean().default(false), tags: z.array(z.string()).default([]), language: z.enum(['zh', 'en']).default('zh'), translationKey: z.string().optional() }) });
export const collections = { posts };
