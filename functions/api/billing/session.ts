import worker, { type Env } from '../../../worker/src/index';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Cloudflare Pages 同域付费余额接口。
 * 与独立 Worker 共用同一份 D1 钱包逻辑。
 */
export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  return worker.fetch(context.request, context.env, {
    waitUntil: promise => context.waitUntil(promise),
  });
}
