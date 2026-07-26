const FALLBACK_SITE_URL = 'https://metisziwei.com';

function normalizePublicUrl(value: string | undefined): string {
  const candidate = value?.trim() || FALLBACK_SITE_URL;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return FALLBACK_SITE_URL;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/**
 * 站点唯一公开地址。
 * Cloudflare Pages 可通过 NEXT_PUBLIC_SITE_URL 覆盖；未配置时使用正式域名。
 */
export const SITE_URL = normalizePublicUrl(process.env.NEXT_PUBLIC_SITE_URL);
