export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface StreamAiOptions {
  chart: unknown;
  messages: AiMessage[];
  onDelta: (delta: string, fullText: string) => void;
  signal?: AbortSignal;
  turnstileToken?: string;
}

const LEGACY_AI_API_URL = 'https://ziwei-ai-api.730333227.workers.dev/api/interpret';
const CLIENT_ID_KEY = 'ziwei-ai-client-id';

export const AI_API_URL = (
  process.env.NEXT_PUBLIC_AI_API_URL?.trim() || LEGACY_AI_API_URL
).replace(/\/$/, '');

export class AiApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
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

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = response.status === 429
    ? '请求过于频繁，请稍后再试。'
    : response.status === 401
      ? '人机验证失败，请刷新后重试。'
      : response.status >= 500
        ? 'AI 服务暂时不可用，请稍后重试。'
        : '请求失败，请检查信息后重试。';

  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const message = parsed.error ?? parsed.message;
      return typeof message === 'string' && message.trim() ? message : fallback;
    } catch {
      return text.length <= 160 ? text : fallback;
    }
  } catch {
    return fallback;
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
  messages,
  onDelta,
  signal,
  turnstileToken,
}: StreamAiOptions): Promise<string> {
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ziwei-Client': getOrCreateAiClientId(),
    },
    signal,
    body: JSON.stringify({
      chart,
      messages,
      turnstileToken,
      clientId: getOrCreateAiClientId(),
    }),
  });

  if (!response.ok) {
    throw new AiApiError(await readErrorMessage(response), response.status);
  }
  if (!response.body) {
    throw new AiApiError('AI 服务没有返回内容。', response.status);
  }

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
