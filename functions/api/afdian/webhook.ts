import worker, { type Env } from '../../../worker/src/index';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Cloudflare Pages 同域爱发电回调接口。
 * Worker 会校验私有 token，并通过爱发电 query-order API 回查真实订单。
 */
export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  return worker.fetch(context.request, context.env, {
    waitUntil: promise => context.waitUntil(promise),
  });
}
