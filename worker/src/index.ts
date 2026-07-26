export interface Env {
  DEEPSEEK_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  TURNSTILE_SECRET?: string;
}

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 5;

const memoryRate = new Map<string, { count: number; expires: number }>();

function cors(origin: string, env: Env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function tooMany(ip: string) {
  const now = Date.now();
  const old = memoryRate.get(ip);
  if (!old || old.expires < now) {
    memoryRate.set(ip, { count: 1, expires: now + WINDOW_SECONDS * 1000 });
    return false;
  }
  old.count += 1;
  return old.count > MAX_REQUESTS_PER_WINDOW;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '*';
    const headers = cors(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (tooMany(ip)) {
      return Response.json({ error: '请求过于频繁，请稍后再试' }, { status: 429, headers });
    }

    const length = Number(request.headers.get('content-length') || 0);
    if (length > 200000) {
      return Response.json({ error: '请求内容过大' }, { status: 413, headers });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'JSON格式错误' }, { status: 400, headers });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: true,
        messages: (body as any).messages || [],
      }),
    });

    if (!response.ok || !response.body) {
      return Response.json({ error: 'AI服务异常' }, { status: 502, headers });
    }

    const transformed = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data:')) continue;
          if (line.includes('[DONE]')) {
            controller.enqueue('data: [DONE]\n\n');
            continue;
          }
          try {
            const json = JSON.parse(line.slice(5));
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(`data: ${JSON.stringify({ delta: { text: content } })}\n\n`);
            }
          } catch {}
        }
      },
    });

    return new Response(response.body.pipeThrough(transformed), {
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  },
};
