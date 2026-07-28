const FALLBACK_SITE_URL = 'https://ziwei-doushu-5xd.pages.dev';

function normalizePublicUrl(value: string | undefined): string {
  const candidate = value?.trim() || FALLBACK_SITE_URL;

  try {
    const url = new URL(candidate);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !isLocal) return FALLBACK_SITE_URL;
    return url.toString().replace(/\/$/, '');
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/**
 * 站点唯一公开地址。
 * 当前默认使用 Cloudflare Pages 正式地址；绑定独立域名后，通过
 * NEXT_PUBLIC_SITE_URL 覆盖，Canonical、Open Graph、Sitemap 和 robots 会同步更新。
 */
export const SITE_URL = normalizePublicUrl(process.env.NEXT_PUBLIC_SITE_URL);
