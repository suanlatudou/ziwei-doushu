import worker, { type Env } from '../../worker/src/index';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Cloudflare Pages 同域 AI 接口。
 *
 * 复用独立 Worker 的完整校验、知识检索、DeepSeek 流式输出、缓存与额度逻辑，
 * 让前端与 API 随同一个 Pages 项目一起部署，避免独立 workers.dev 未部署或 CORS 不同步。
 */
export function onRequest(context: PagesFunctionContext): Promise<Response> {
  return worker.fetch(context.request, context.env, {
    waitUntil: promise => context.waitUntil(promise),
  });
}
