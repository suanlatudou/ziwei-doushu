import worker, { type Env } from '../../worker/src/index';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

const API_SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Cloudflare Pages 同域 AI 接口。
 * 复用 Worker 的校验、知识检索、流式输出、缓存、额度与限流逻辑，
 * 并确保 Pages Function 自身的全部响应都带有明确的安全与隐私响应头。
 */
export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const response = await worker.fetch(context.request, context.env, {
    waitUntil: promise => context.waitUntil(promise),
  });
  const secured = new Response(response.body, response);
  Object.entries(API_SECURITY_HEADERS).forEach(([name, value]) => secured.headers.set(name, value));
  return secured;
}
