import { readFileSync, writeFileSync } from 'node:fs';

const path = 'worker/src/index.ts';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Patch target is not unique: ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`    if (!env.DB) {
      return jsonResponse({
        error: '次数服务尚未配置，请先绑定 D1 数据库',
        code: 'DATABASE_NOT_CONFIGURED',
      }, 503, headers);
    }

    const db = env.DB;`,
`    // D1 is optional during rollout. When it is not bound, requests continue
    // without quota enforcement or persistent caching instead of taking AI offline.
    const db = env.DB;`,
  'remove hard D1 requirement',
);

replaceOnce(
  '    if (Math.random() < 0.01) {',
  '    if (db && Math.random() < 0.01) {',
  'guard cache cleanup',
);

replaceOnce(
  '    if (body.cache !== false) {',
  '    if (db && body.cache !== false) {',
  'guard cache lookup',
);

replaceOnce(
`    let charge: ChargeResult;
    try {
      charge = await chargeQuota(
        db,
        clientId,
        mode,
        freeDailyLimit,
        compatibilityCost,
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
    }`,
`    let charge: ChargeResult = { allowed: true, kind: 'none', units: 0 };
    if (db) {
      try {
        charge = await chargeQuota(
          db,
          clientId,
          mode,
          freeDailyLimit,
          compatibilityCost,
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
    }`,
  'make quota enforcement optional',
);

source = source.replaceAll(
  '      await refundQuota(db, clientId, charge);',
  '      if (db) await refundQuota(db, clientId, charge);',
);

replaceOnce(
`    const [clientStream, auditStream] = upstream.body.tee();`,
`    if (!db) {
      return new Response(transformDeepSeekStream(upstream.body), {
        status: 200,
        headers: sseHeaders(headers, 'MISS', charge),
      });
    }

    const [clientStream, auditStream] = upstream.body.tee();`,
  'add no-D1 streaming path',
);

if (source.includes('DATABASE_NOT_CONFIGURED')) {
  throw new Error('Hard D1 failure path still exists');
}
if (!source.includes('if (!db) {\n      return new Response(transformDeepSeekStream(upstream.body)')) {
  throw new Error('No-D1 streaming fallback was not installed');
}

writeFileSync(path, source);
