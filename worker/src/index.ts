import {
  buildKnowledgeContext,
  KNOWLEDGE_VERSION,
  type AiMode,
} from './knowledge';
import {
  chargeQuota,
  getCachedResponse,
  purgeExpiredCache,
  recordUsage,
  refundQuota,
  saveCachedResponse,
  type ChargeResult,
  type D1Database,
} from './storage';
import {
  handleAfdianWebhook,
  handleBillingSession,
  hashBillingClientId,
  isValidBillingClientId,
} from './billing';

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_THINKING?: string;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_SECRET?: string;
  FREE_DAILY_LIMIT?: string;
  COMPATIBILITY_CREDIT_COST?: string;
  AI_CACHE_TTL_SECONDS?: string;
  RATE_LIMITER?: RateLimitBinding;
  DB?: D1Database;
}

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface InterpretRequest {
  chart: unknown;
  secondaryChart?: unknown;
  mode: AiMode;
  messages: ChatMessage[];
  turnstileToken?: string;
  clientId?: string;
  cache: boolean;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://metisziwei.com',
  'https://www.metisziwei.com',
  'https://ziwei-doushu-5xd.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const PAGES_PREVIEW_SUFFIX = '.ziwei-doushu-5xd.pages.dev';
const MAX_BODY_BYTES = 320_000;
const MAX_CHART_CHARS = 180_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 12_000;
const DEFAULT_FREE_DAILY_LIMIT = 3;
const DEFAULT_COMPATIBILITY_COST = 2;
const DEFAULT_CACHE_TTL_SECONDS = 604_800;
const MAX_CACHE_TTL_SECONDS = 2_592_000;

const NO_CHARGE: ChargeResult = {
  allowed: true,
  kind: 'none',
  units: 0,
};

function jsonResponse(data: unknown, status: number, headers: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

function mergeResponseHeaders(response: Response, extraHeaders: HeadersInit): Response {
  const merged = new Response(response.body, response);
  const headers = new Headers(extraHeaders);
  headers.forEach((value, key) => merged.headers.set(key, value));
  return merged;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function parseAllowedOrigins(env: Env): Set<string> {
  const configured = env.ALLOWED_ORIGINS
    ?.split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean) ?? [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(origin: string | null, allowedOrigins: Set<string>): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.has(normalized)) return true;

  try {
    const url = new URL(normalized);
    return url.protocol === 'https:'
      && url.hostname.endsWith(PAGES_PREVIEW_SUFFIX);
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null, allowedOrigins: Set<string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type, x-ziwei-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'x-ai-cache, x-ai-quota, x-ai-remaining-free, x-ai-remaining-credits',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (record.role === 'user' || record.role === 'assistant')
    && typeof record.content === 'string'
    && record.content.trim().length > 0
    && record.content.length <= MAX_MESSAGE_CHARS;
}

function normalizeRequest(value: unknown): InterpretRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.filter(isValidMessage).slice(-MAX_MESSAGES)
    : [];
  const mode: AiMode = raw.mode === 'compatibility' ? 'compatibility' : 'chart';

  if (
    messages.length === 0
    || raw.chart === undefined
    || (mode === 'compatibility' && raw.secondaryChart === undefined)
  ) {
    return null;
  }

  return {
    chart: raw.chart,
    secondaryChart: raw.secondaryChart,
    mode,
    messages,
    turnstileToken: typeof raw.turnstileToken === 'string' ? raw.turnstileToken : undefined,
    clientId: typeof raw.clientId === 'string' ? raw.clientId.slice(0, 128) : undefined,
    cache: raw.cache !== false,
  };
}

async function verifyTurnstile(token: string | undefined, ip: string, secret: string): Promise<boolean> {
  if (!token) return false;

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip !== 'unknown') form.append('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!response.ok) return false;

  const result = await response.json() as { success?: boolean };
  return result.success === true;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function resolveSubjectKey(request: Request, body: InterpretRequest): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';

  // 免费次数主体仍以网络环境为主，避免通过清空 localStorage 无限刷新免费额度。
  // clientId 只在本地开发无 CF-IP 时兜底；线上 clientId 仅用于付费钱包。
  const localFallback = ip === 'unknown' ? (body.clientId || 'anonymous') : '';
  return `subject:${await sha256Hex(`${ip}|${userAgent}|${localFallback}`)}`;
}

async function resolveWalletClientHash(clientId: string | undefined): Promise<string | undefined> {
  if (!clientId || !isValidBillingClientId(clientId)) return undefined;
  return hashBillingClientId(clientId);
}

function stripChartIdentity(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const chart = value as Record<string, unknown>;
  const birthInfo = chart.birthInfo;
  if (!birthInfo || typeof birthInfo !== 'object' || Array.isArray(birthInfo)) {
    return chart;
  }

  const {
    name: _name,
    province: _province,
    city: _city,
    longitude: _longitude,
    ...anonymousBirthInfo
  } = birthInfo as Record<string, unknown>;

  return {
    ...chart,
    birthInfo: anonymousBirthInfo,
  };
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

async function makeCacheKey(
  body: InterpretRequest,
  model: string,
  thinkingType: 'enabled' | 'disabled',
): Promise<string> {
  return sha256Hex(stableJson({
    version: KNOWLEDGE_VERSION,
    mode: body.mode,
    chart: stripChartIdentity(body.chart),
    secondaryChart: body.mode === 'compatibility'
      ? stripChartIdentity(body.secondaryChart)
      : undefined,
    messages: body.messages,
    model,
    thinkingType,
  }));
}

function buildSystemMessage(
  body: InterpretRequest,
  knowledgeContext: string,
): ChatMessage {
  const chartData = body.mode === 'compatibility'
    ? {
        partyA: stripChartIdentity(body.chart),
        partyB: stripChartIdentity(body.secondaryChart),
      }
    : stripChartIdentity(body.chart);
  const chartJson = JSON.stringify(chartData);
  if (!chartJson || chartJson.length > MAX_CHART_CHARS) {
    throw new Error('CHART_TOO_LARGE');
  }

  const modeInstruction = body.mode === 'compatibility'
    ? '这是双人合盘。必须同时分析甲方和乙方，并明确指出依据来自哪一方的宫位、星曜或四化。'
    : '这是单人命盘解读。';

  return {
    role: 'system',
    content: `你是严谨的紫微斗数传统文化解读助手。${modeInstruction}
必须以系统提供的结构化盘面和知识检索结果为依据，不得虚构盘中不存在的信息；如果证据不足，应明确说明。
古籍中若出现“必然”“生离死别”“刑克”“灾祸”等绝对或恐吓性措辞，只能作为历史术语解释，不得照搬为现实结论。必须改写为审慎、条件化、可验证的表达。
内容仅供传统文化学习和个人思考，不得替代医疗、法律、投资、婚姻、教育或其他重大决策。

【结构化命盘数据】
${chartJson}

【知识检索结果】
${knowledgeContext || '本次未命中额外知识条目，请仅依据结构化命盘作答。'}`,
  };
}

function parseDeepSeekData(data: string): { done: boolean; content: string } {
  if (!data) return { done: false, content: '' };
  if (data === '[DONE]') return { done: true, content: '' };

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string | null } }>;
    };
    return {
      done: false,
      content: parsed.choices?.[0]?.delta?.content ?? '',
    };
  } catch {
    return { done: false, content: '' };
  }
}

function transformDeepSeekStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let doneSent = false;

  const emitLine = (rawLine: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) return;

    const parsed = parseDeepSeekData(line.slice(5).trimStart());
    if (parsed.done) {
      if (!doneSent) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        doneSent = true;
      }
      return;
    }
    if (parsed.content) {
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ delta: { text: parsed.content } })}\n\n`,
      ));
    }
  };

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(line => emitLine(line, controller));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.trim()) emitLine(buffer, controller);
      if (!doneSent) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return stream.pipeThrough(transformer);
}

async function collectDeepSeekStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let serverDone = false;

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) return;
    const parsed = parseDeepSeekData(line.slice(5).trimStart());
    serverDone ||= parsed.done;
    fullText += parsed.content;
  };

  while (!serverDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(consumeLine);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
  return fullText;
}

function sseHeaders(
  baseHeaders: Record<string, string>,
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS',
  charge?: ChargeResult,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...baseHeaders,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
    'X-AI-Cache': cacheStatus,
    'X-AI-Quota': charge?.kind ?? 'none',
  };

  if (charge?.remainingFree !== undefined) {
    headers['X-AI-Remaining-Free'] = String(charge.remainingFree);
  }
  if (charge?.remainingCredits !== undefined) {
    headers['X-AI-Remaining-Credits'] = String(charge.remainingCredits);
  }
  return headers;
}

function cachedSseResponse(text: string, headers: Record<string, string>): Response {
  const encoder = new TextEncoder();
  return new Response(encoder.encode(
    `data: ${JSON.stringify({ delta: { text } })}\n\ndata: [DONE]\n\n`,
  ), {
    status: 200,
    headers,
  });
}

async function finalizeCompletion(options: {
  db: D1Database;
  stream: ReadableStream<Uint8Array>;
  subjectKey: string;
  mode: AiMode;
  cacheKey: string;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  charge: ChargeResult;
}): Promise<void> {
  const {
    db,
    stream,
    subjectKey,
    mode,
    cacheKey,
    cacheEnabled,
    cacheTtlSeconds,
    charge,
  } = options;

  let fullText: string;
  try {
    fullText = await collectDeepSeekStream(stream);
  } catch (error) {
    console.error('DeepSeek stream collection failed', error);
    await refundQuota(db, subjectKey, charge).catch(refundError => {
      console.error('Quota refund failed', refundError);
    });
    return;
  }

  if (!fullText.trim()) {
    console.error('DeepSeek stream completed without content');
    await refundQuota(db, subjectKey, charge).catch(refundError => {
      console.error('Quota refund failed', refundError);
    });
    return;
  }

  if (cacheEnabled) {
    const expiresAt = Math.floor(Date.now() / 1000) + cacheTtlSeconds;
    await saveCachedResponse(db, cacheKey, mode, fullText, expiresAt).catch(error => {
      console.error('AI cache save failed', error);
    });
  }

  await recordUsage(db, subjectKey, mode, false, charge).catch(error => {
    console.error('AI usage recording failed', error);
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContextLike,
  ): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigins = parseAllowedOrigins(env);
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      if (!origin || !isAllowedOrigin(origin, allowedOrigins)) {
        return new Response(null, { status: 403, headers });
      }
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        service: 'ziwei-ai-api',
        database: Boolean(env.DB),
        billing: Boolean(env.DB),
        knowledgeVersion: KNOWLEDGE_VERSION,
      }, 200, headers);
    }

    // 爱发电服务器回调没有浏览器 Origin，不使用浏览器 CORS 限制；安全性由 RSA 验签保证。
    if (url.pathname === '/api/afdian/webhook') {
      return handleAfdianWebhook(request, env);
    }

    if (url.pathname === '/api/billing/session') {
      if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
        return jsonResponse({ error: '当前来源未获授权' }, 403, headers);
      }
      const response = await handleBillingSession(request, env);
      return mergeResponseHeaders(response, headers);
    }

    if (url.pathname !== '/api/interpret') {
      return jsonResponse({ error: '接口不存在' }, 404, headers);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: '仅支持 POST 请求' }, 405, headers);
    }
    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      return jsonResponse({ error: '当前来源未获授权' }, 403, headers);
    }
    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse({ error: 'AI 服务尚未配置' }, 503, headers);
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: '请求内容过大' }, 413, headers);
    }

    let rawBody: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return jsonResponse({ error: '请求内容过大' }, 413, headers);
      }
      rawBody = JSON.parse(text);
    } catch {
      return jsonResponse({ error: '请求格式错误' }, 400, headers);
    }

    const body = normalizeRequest(rawBody);
    if (!body) {
      return jsonResponse({ error: '命盘、合盘对象或对话内容不完整' }, 400, headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.TURNSTILE_SECRET) {
      const verified = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET);
      if (!verified) {
        return jsonResponse({ error: '人机验证失败，请刷新后重试' }, 401, headers);
      }
    }

    const subjectKey = await resolveSubjectKey(request, body);
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: subjectKey });
      if (!success) {
        return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, headers);
      }
    }

    const db = env.DB;
    const mode = body.mode;
    const model = env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    const thinkingType: 'enabled' | 'disabled' = env.DEEPSEEK_THINKING === 'enabled'
      ? 'enabled'
      : 'disabled';
    const question = [...body.messages]
      .reverse()
      .find(message => message.role === 'user')
      ?.content.trim() ?? '';
    const cacheKey = await makeCacheKey(body, model, thinkingType);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (db && Math.random() < 0.01) {
      context.waitUntil(purgeExpiredCache(db, nowSeconds).catch(error => {
        console.error('Expired cache purge failed', error);
      }));
    }

    if (db && body.cache) {
      try {
        const cached = await getCachedResponse(db, cacheKey, mode, nowSeconds);
        if (cached) {
          context.waitUntil(recordUsage(db, subjectKey, mode, true, NO_CHARGE).catch(error => {
            console.error('Cache-hit usage recording failed', error);
          }));
          return cachedSseResponse(cached, sseHeaders(headers, 'HIT', NO_CHARGE));
        }
      } catch (error) {
        console.error('AI cache read failed; continuing without cache', error);
      }
    }

    const freeDailyLimit = parsePositiveInteger(
      env.FREE_DAILY_LIMIT,
      DEFAULT_FREE_DAILY_LIMIT,
      100,
    );
    const compatibilityCost = parsePositiveInteger(
      env.COMPATIBILITY_CREDIT_COST,
      DEFAULT_COMPATIBILITY_COST,
      100,
    );
    const walletClientHash = await resolveWalletClientHash(body.clientId);

    let charge: ChargeResult = NO_CHARGE;
    if (db) {
      try {
        charge = await chargeQuota(
          db,
          subjectKey,
          mode,
          freeDailyLimit,
          compatibilityCost,
          walletClientHash,
        );
      } catch (error) {
        console.error('Quota charge failed', error);
        return jsonResponse({ error: '次数服务暂时不可用，请稍后重试' }, 503, headers);
      }

      if (!charge.allowed) {
        return jsonResponse({
          error: '今日免费次数和付费次数均已用完，请充值次数或开通 VIP',
          code: 'INSUFFICIENT_QUOTA',
          remainingFree: charge.remainingFree ?? 0,
          remainingCredits: charge.remainingCredits ?? 0,
        }, 402, headers);
      }
    }

    let systemMessage: ChatMessage;
    try {
      const knowledgeContext = buildKnowledgeContext(
        body.chart,
        body.secondaryChart,
        question,
        mode,
      );
      systemMessage = buildSystemMessage(body, knowledgeContext);
    } catch (error) {
      console.error('Knowledge or chart preparation failed', error);
      if (db) await refundQuota(db, subjectKey, charge).catch(() => undefined);
      return jsonResponse({ error: '命盘数据过大或无法解析' }, 413, headers);
    }

    let upstream: Response;
    try {
      upstream = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.4,
          max_tokens: 4096,
          thinking: { type: thinkingType },
          messages: [systemMessage, ...body.messages],
        }),
      });
    } catch (error) {
      console.error('DeepSeek request failed before response', error);
      if (db) await refundQuota(db, subjectKey, charge).catch(() => undefined);
      return jsonResponse({ error: 'AI 服务暂时不可用，请稍后重试' }, 502, headers);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.error('DeepSeek request failed', upstream.status, detail.slice(0, 1000));
      if (db) await refundQuota(db, subjectKey, charge).catch(() => undefined);
      return jsonResponse({ error: 'AI 服务暂时不可用，请稍后重试' }, 502, headers);
    }

    if (!db) {
      return new Response(transformDeepSeekStream(upstream.body), {
        status: 200,
        headers: sseHeaders(headers, 'BYPASS', charge),
      });
    }

    const [clientStream, auditStream] = upstream.body.tee();
    const cacheTtlSeconds = parsePositiveInteger(
      env.AI_CACHE_TTL_SECONDS,
      DEFAULT_CACHE_TTL_SECONDS,
      MAX_CACHE_TTL_SECONDS,
    );
    context.waitUntil(finalizeCompletion({
      db,
      stream: auditStream,
      subjectKey,
      mode,
      cacheKey,
      cacheEnabled: body.cache,
      cacheTtlSeconds,
      charge,
    }));

    return new Response(transformDeepSeekStream(clientStream), {
      status: 200,
      headers: sseHeaders(headers, 'MISS', charge),
    });
  },
};
