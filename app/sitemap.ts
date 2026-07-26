/**
 * 自动生成 sitemap.xml
 */

import type { MetadataRoute } from 'next';
import { ALL_BOOKS } from '@/lib/classics';
import { getAllKnowledgeRoutes } from '@/lib/seo/knowledge';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

type SitemapEntry = MetadataRoute.Sitemap[number];

const BASE_URL = SITE_URL;
const MONTHLY = 'monthly' as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastmod = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'weekly', lastModified: lastmod },
    { url: `${BASE_URL}/chart`, priority: 0.95, changeFrequency: 'weekly', lastModified: lastmod },
    { url: `${BASE_URL}/heming`, priority: 0.7, changeFrequency: 'weekly', lastModified: lastmod },
    { url: `${BASE_URL}/library`, priority: 0.85, changeFrequency: 'weekly', lastModified: lastmod },
    { url: `${BASE_URL}/knowledge`, priority: 0.9, changeFrequency: 'weekly', lastModified: lastmod },
    { url: `${BASE_URL}/terms`, priority: 0.3, changeFrequency: MONTHLY, lastModified: lastmod },
    { url: `${BASE_URL}/privacy`, priority: 0.3, changeFrequency: MONTHLY, lastModified: lastmod },
  ];

  const libraryPages = ALL_BOOKS.flatMap((book): SitemapEntry[] => {
    const bookHome: SitemapEntry = {
      url: `${BASE_URL}/library/${book.slug}`,
      priority: 0.75,
      changeFrequency: MONTHLY,
      lastModified: lastmod,
    };

    const chapterPages: SitemapEntry[] = book.chapters.map((_, index): SitemapEntry => ({
      url: `${BASE_URL}/library/${book.slug}/${index}`,
      priority: 0.7,
      changeFrequency: MONTHLY,
      lastModified: lastmod,
    }));

    return [bookHome, ...chapterPages];
  });

  const knowledgePages: SitemapEntry[] = getAllKnowledgeRoutes().map(
    ({ slug, topic }): SitemapEntry => ({
      url: `${BASE_URL}/knowledge/${slug}/${topic}`,
      priority: 0.7,
      changeFrequency: MONTHLY,
      lastModified: lastmod,
    }),
  );

  return [...staticPages, ...libraryPages, ...knowledgePages];
}
