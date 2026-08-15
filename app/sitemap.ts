import type { MetadataRoute } from 'next';

const BASE = 'https://www.mytailoredtaste.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/services`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/menus`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/contact`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
