import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/invoice/', '/api/'],
      },
    ],
    sitemap: 'https://www.mytailoredtaste.com/sitemap.xml',
  };
}
