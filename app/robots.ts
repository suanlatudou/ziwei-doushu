import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const BASE_URL = 'https://ziwei-doushu-5xd.pages.dev';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/preview-versions/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
