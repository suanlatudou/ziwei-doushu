export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface StreamAiOptions {
  chart: unknown;
  secondaryChart?: unknown;
  mode?: 'chart' | 'compatibility';
  messages: AiMessage[];
  onDelta: (delta: string, fullText: string) => void;
  onMeta?: (meta: AiResponseMeta) => void;
  signal?: AbortSignal;
  turnstileToken?: string;
  cache?: boolean;
}

export interface AiResponseMeta {
  cacheHit: boolean;
  remainingFree?: number;
  remainingCredits?: number;
}

const LEGACY_AI_API_URL = 'https://ziwei-ai-api.730333227.workers.dev/api/interpret';
const CLIENT_ID_KEY = 'ziwei-ai-client-id';

export const AI_API_URL = (
  process.env.NEXT_PUBLIC_AI_API_URL?.trim() || LEGACY_AI_API_URL
).replace(/\/$/, '');

export class AiApiError extends Error {
  status?: number;
  code?: string;
  remainingFree?: number;
  remainingCredits?: number;

  constructor(
    message: string,
    status?: number,
    details?: { code?: string; remainingFree?: number; remainingCredits?: number },
  ) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.code = details?.code;
    this.remainingFree = details?.remainingFree;
    this.remainingCredits = details?.remainingCredits;
  }
}

export function getOrCreateAiClientId(): string {
  if (typeof window === 'undefined') return 'server-render';

  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

  window.localStorage.setItem(CLIENT_ID_KEY, generated);
  return generated;
}

async function readErrorDetails(response: Response): Promise<{
  message: string;
  code?: string;
  remainingFree?: number;
  remainingCredits?: number;
}> {
  const fallback = response.status === 402
    ? '今日免费次数和付费次数均已用完，请充值次数或开通 VIP。'
    : response.status === 429
    ? '请求过于频繁，请稍后再试。'
    : response.status === 401
      ? '人机验证失败，请刷新后重试。'
      : response.status >= 500
        ? 'AI 服务暂时不可用，请稍后重试。'
        : '请求失败，请检查信息后重试。';

  try {
    const text = await response.text();
    if (!text) return { message: fallback };

    try {
      const parsed = JSON.parse(text) as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
        remainingFree?: unknown;
        remainingCredits?: unknown;
      };
      const message = parsed.error ?? parsed.message;
      return {
        message: typeof message === 'string' && message.trim() ? message : fallback,
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        remainingFree: typeof parsed.remainingFree === 'number' ? parsed.remainingFree : undefined,
        remainingCredits: typeof parsed.remainingCredits === 'number' ? parsed.remainingCredits : undefined,
      };
    } catch {
      return { message: text.length <= 160 ? text : fallback };
    }
  } catch {
    return { message: fallback };
  }
}

function extractDelta(data: string): string {
  try {
    const parsed = JSON.parse(data) as {
      delta?: { text?: string };
      choices?: Array<{ delta?: { content?: string | null } }>;
      content?: string;
    };

    return parsed.delta?.text
      ?? parsed.choices?.[0]?.delta?.content
      ?? parsed.content
      ?? '';
  } catch {
    return '';
  }
}

export async function streamAiInterpret({
  chart,
  secondaryChart,
  mode = 'chart',
  messages,
  onDelta,
  onMeta,
  signal,
  turnstileToken,
  cache = true,
}: StreamAiOptions): Promise<string> {
  const clientId = getOrCreateAiClientId();
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ziwei-Client': clientId,
    },
    signal,
    body: JSON.stringify({
      chart,
      secondaryChart,
      mode,
      messages,
      turnstileToken,
      clientId,
      cache,
    }),
  });

  if (!response.ok) {
    const details = await readErrorDetails(response);
    throw new AiApiError(details.message, response.status, details);
  }
  if (!response.body) {
    throw new AiApiError('AI 服务没有返回内容。', response.status);
  }

  const parseOptionalNumber = (value: string | null): number | undefined => {
    if (value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  onMeta?.({
    cacheHit: response.headers.get('X-AI-Cache') === 'HIT',
    remainingFree: parseOptionalNumber(response.headers.get('X-AI-Remaining-Free')),
    remainingCredits: parseOptionalNumber(response.headers.get('X-AI-Remaining-Credits')),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let serverDone = false;

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) return;

    const data = line.slice(5).trimStart();
    if (!data) return;
    if (data === '[DONE]') {
      serverDone = true;
      return;
    }

    const delta = extractDelta(data);
    if (!delta) return;

    fullText += delta;
    onDelta(delta, fullText);
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

  if (!fullText.trim()) {
    throw new AiApiError('AI 服务未返回有效内容。');
  }

  return fullText;
}
