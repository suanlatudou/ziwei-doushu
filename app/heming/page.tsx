'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import { generateChart } from '@/lib/ziwei/algorithm';
import { formToBirthInfo } from '@/lib/ziwei/share';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { useTheme } from '@/components/ThemeProvider';

const AI_WORKER_URL = 'https://ziwei-ai-api.730333227.workers.dev/api/interpret';

function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} style={{ paddingTop: i === 0 ? 0 : '14px', paddingBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ac)', letterSpacing: '0.04em' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--tx-2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} style={{ fontWeight: 500, color: 'var(--tx-0)' }}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span style={{
          display: 'inline-block', width: '7px', height: '13px',
          background: 'var(--ac)', opacity: 0.5, borderRadius: '2px',
          animation: 'pulse 1s ease-in-out infinite',
          verticalAlign: 'middle', marginLeft: '2px',
        }} />
      )}
    </div>
  );
}

function isFormReady(form: BirthFormState | null): boolean {
  if (!form || !form.year || !form.month || !form.day) return false;
  if (!form.unknownTime && (form.clockHour === '' || form.clockMinute === '')) return false;

  const year = Number(form.year);
  const month = Number(form.month);
  const day = Number(form.day);
  const date = new Date(year, month - 1, day);

  return year >= 1900
    && year <= 2026
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function buildCompatibilityPrompt(
  chartB: ZiweiChart,
  formA: BirthFormState,
  formB: BirthFormState,
  question?: string,
): string {
  const nameA = formA.name.trim() || '甲方';
  const nameB = formB.name.trim() || '乙方';
  const followUp = question?.trim();

  return `你现在进行的是紫微斗数双人合盘，而不是单人命盘解读。
请严格基于两份紫微斗数命盘中的星曜、宫位互动关系进行分析，不要脱离盘面空谈。
系统附带的命盘数据是甲方【${nameA}】的命盘；下面 JSON 是乙方【${nameB}】的完整命盘数据：

${JSON.stringify(chartB)}

请同时对照双方命宫、夫妻宫、福德宫、迁移宫及其三方四正、主星与四化关系进行交叉分析。不要只解读其中一方，也不要给出宿命式、绝对化结论。

${followUp ? `用户本次追问：${followUp}

请直接回答该问题，并结合双方命盘说明依据。` : `请按以下结构输出：

**【关系定性】**
用一句话概括双方关系的核心模式，不使用“注定”“绝对”等表述。

**【相互吸引】**
分析双方容易互相欣赏、支持和产生吸引的地方。

**【情感需求】**
分别说明双方在亲密关系中的主要需求，以及彼此能否理解和满足。

**【冲突风险】**
指出最容易产生误会、争执或压力的地方，并说明冲突形成机制。

**【长期相处】**
分析长期关系中需要重点经营的方面，以及双方适合的相处节奏。

**【沟通建议】**
分别给甲方和乙方具体、温和、可执行的沟通与相处建议。

**【综合结论】**
总结关系优势与需要共同面对的课题，不以合盘结果替代现实判断。`}

内容仅用于传统文化学习、关系沟通与个人思考参考，不得替代婚姻、心理、法律、医疗、投资或其他重大决策。`;
}

export default function HemingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [chartA, setChartA] = useState<ZiweiChart | null>(null);
  const [chartB, setChartB] = useState<ZiweiChart | null>(null);
  const [formA, setFormA] = useState<BirthFormState | null>(null);
  const [formB, setFormB] = useState<BirthFormState | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);

  const handleFormAChange = useCallback((data: BirthFormState) => {
    setFormA(data);
    setChartA(null);
    setAnalysis('');
    setAnalysisError(null);
  }, []);

  const handleFormBChange = useCallback((data: BirthFormState) => {
    setFormB(data);
    setChartB(null);
    setAnalysis('');
    setAnalysisError(null);
  }, []);

  const runAnalysis = useCallback(async (requestedQuestion?: string) => {
    setFormError(null);
    setAnalysisError(null);

    if (!isFormReady(formA) || !isFormReady(formB)) {
      setFormError('请先填写双方完整、有效的出生信息');
      return;
    }

    if (!noticeAccepted) {
      setFormError('请先勾选并确认合盘使用提示');
      return;
    }

    setAnalyzing(true);
    setAnalysis('');

    try {
      const currentChartA = chartA ?? generateChart(formToBirthInfo(formA));
      const currentChartB = chartB ?? generateChart(formToBirthInfo(formB));

      if (!chartA) setChartA(currentChartA);
      if (!chartB) setChartB(currentChartB);

      const prompt = buildCompatibilityPrompt(currentChartB, formA, formB, requestedQuestion);
      const res = await fetch(AI_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart: currentChartA,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('合盘 Worker 请求失败', res.status, detail);
        throw new Error(`AI 服务返回 ${res.status}`);
      }
      if (!res.body) throw new Error('AI 服务没有返回内容');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let buffer = '';
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

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.delta?.text
            ?? parsed.choices?.[0]?.delta?.content
            ?? parsed.content
            ?? '';
          if (delta) {
            text += delta;
            setAnalysis(text);
          }
        } catch {
          // 忽略非 JSON 的 SSE 行。
        }
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
      if (!text.trim()) throw new Error('AI 服务未返回有效合盘内容');

      setQuestion('');
      setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) {
      console.error('合盘分析失败', error);
      setAnalysisError(error instanceof Error ? error.message : '分析暂时不可用，请重试');
    } finally {
      setAnalyzing(false);
    }
  }, [chartA, chartB, formA, formB, noticeAccepted]);

  const cardStyle = {
    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(200,160,60,0.2)'}`,
    borderRadius: '16px',
    padding: '24px',
  };

  const labelStyle = {
    fontSize: '10px', letterSpacing: '0.4em', color: 'var(--ac)', opacity: 0.7,
    marginBottom: '16px', display: 'block',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: isDark ? 'rgba(2,8,16,0.88)' : 'rgba(250,245,235,0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--bdr)',
        display: 'flex', alignItems: 'center', padding: '0 24px', height: '52px', gap: '16px',
      }}>
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px',
            color: 'var(--tx-3)', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '16px' }}>‹</span>
          <span>返回</span>
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--bdr-med)' }} />
        <span style={{ fontSize: '12px', color: 'var(--ac)', letterSpacing: '0.2em' }}>合盘分析</span>
        <div style={{ flex: 1 }} />
        <span className="heming-header-types" style={{ fontSize: '11px', color: 'var(--tx-3)' }}>感情 · 合伙 · 亲子 · 朋友</span>
      </header>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '28px', color: 'var(--ac)', opacity: 0.15, marginBottom: '12px' }}>☯</div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '0.15em', color: 'var(--tx-0)', marginBottom: '8px' }}>
            紫微合盘
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
            输入两个人的出生信息，AI 对照双方命盘分析关系模式、互补点、冲突风险与相处建议
          </p>
        </div>

        <div style={{
          marginBottom: '20px', padding: '16px 18px', borderRadius: '14px',
          background: isDark ? 'rgba(212,168,67,0.07)' : 'rgba(184,146,42,0.08)',
          border: '1px solid rgba(184,146,42,0.25)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ac)', marginBottom: '6px' }}>合盘使用提示</div>
          <p style={{ fontSize: '12px', lineHeight: 1.75, color: 'var(--tx-2)', marginBottom: '10px' }}>
            合盘属于双人专项 AI 解读，后续将单独计费；当前内测期间暂不扣费。结果仅供传统文化学习、关系沟通与个人思考参考，不代表双方关系的确定结论，也不应作为结婚、分手或其他重大决定的唯一依据。
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', cursor: 'pointer', fontSize: '12px', color: 'var(--tx-1)' }}>
            <input
              type="checkbox"
              checked={noticeAccepted}
              onChange={event => {
                setNoticeAccepted(event.target.checked);
                if (event.target.checked) setFormError(null);
              }}
              style={{ marginTop: '2px', accentColor: '#b47a18' }}
            />
            <span>我已阅读并理解以上提示，自愿在上述范围内使用合盘功能。</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }} className="heming-grid">
          <div style={cardStyle}>
            <span style={labelStyle}>甲方 — A</span>
            <BirthForm hideSubmit onSubmit={() => {}} onFormSave={handleFormAChange} />
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>乙方 — B</span>
            <BirthForm hideSubmit onSubmit={() => {}} onFormSave={handleFormBChange} />
          </div>
        </div>

        <div ref={analysisRef} style={{
          ...cardStyle,
          minHeight: '320px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: (!analysis && !analyzing) ? 'center' : 'flex-start',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: (analysis || analyzing) ? '20px' : '24px' }}>
            <span style={{ color: 'var(--ac)', opacity: 0.6 }}>◉</span>
            <span style={{ fontSize: '11px', letterSpacing: '0.3em', color: 'var(--tx-3)' }}>合盘分析 · HEMING</span>
          </div>

          {!analysis && !analyzing && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '13px', color: 'var(--tx-3)', marginBottom: '24px', lineHeight: 1.7 }}>
                填好双方出生信息并确认使用提示后，点击下方按钮<br />
                AI 将对照双方完整命盘生成合盘报告
              </div>
              <button
                onClick={() => runAnalysis()}
                disabled={analyzing}
                style={{
                  padding: '14px 40px', borderRadius: 'var(--r-pill)', border: 'none',
                  background: 'linear-gradient(135deg, #9a6210, #c88020)',
                  color: '#fff8e8', fontSize: '14px', fontWeight: 600,
                  letterSpacing: '0.15em', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(140,100,20,0.25)',
                }}
              >
                开始合盘分析
              </button>
              {formError && <div style={{ marginTop: '20px', fontSize: '13px', color: '#dc2626' }}>{formError}</div>}
            </div>
          )}

          {analyzing && !analysis && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 0', color: 'var(--tx-3)', fontSize: '13px' }}>
              <div style={{
                width: '14px', height: '14px',
                border: '2px solid var(--bdr-med)', borderTopColor: 'var(--ac)',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              正在对比双方命盘…
            </div>
          )}

          {analysis && <AiContent text={analysis} streaming={analyzing} />}

          {analysisError && (
            <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--bdr)', background: 'var(--bg-card)', fontSize: '13px', color: 'var(--tx-2)', marginTop: '12px' }}>
              <div style={{ marginBottom: '10px' }}>分析暂时不可用：{analysisError}</div>
              <button
                onClick={() => runAnalysis()}
                disabled={analyzing}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bdr-med)',
                  background: 'transparent', color: 'var(--ac)', cursor: 'pointer', fontSize: '12px',
                }}
              >
                重新分析
              </button>
            </div>
          )}

          <div style={{ marginTop: '24px', paddingTop: '14px', borderTop: '1px solid var(--bdr)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--ac)', letterSpacing: '0.12em', marginBottom: '3px' }}>AI 生成 · 仅供参考</div>
            <div style={{ fontSize: '10px', color: 'var(--tx-3)', lineHeight: 1.6 }}>合盘内容不代表确定结果，请结合现实相处与独立判断。</div>
          </div>
        </div>

        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--tx-3)', marginBottom: '4px' }}>针对此次合盘继续追问</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['感情匹配度如何？', '适合合伙创业吗？', '两人结婚需要注意什么？', '哪方面最容易产生矛盾？', '财运是否互补？'].map(item => (
                <button
                  key={item}
                  onClick={() => runAnalysis(item)}
                  disabled={analyzing}
                  style={{
                    fontSize: '12px', padding: '6px 14px',
                    borderRadius: 'var(--r-pill)', border: '1px solid var(--bdr-med)',
                    background: 'transparent', color: 'var(--tx-2)',
                    cursor: analyzing ? 'not-allowed' : 'pointer', opacity: analyzing ? 0.5 : 1,
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !analyzing && question.trim()) runAnalysis(question);
                }}
                placeholder="继续追问，如：哪几年是两人关系关键期？"
                disabled={analyzing}
                className="input-base"
                style={{ fontSize: '13px', flex: 1 }}
              />
              <button
                onClick={() => runAnalysis(question)}
                disabled={analyzing || !question.trim()}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
                  background: analyzing || !question.trim() ? 'var(--bg-2)' : 'var(--tx-0)',
                  color: analyzing || !question.trim() ? 'var(--tx-3)' : 'white',
                  fontSize: '13px', fontWeight: 500,
                  cursor: analyzing || !question.trim() ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {analyzing ? '分析中…' : '继续追问'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 680px) {
          .heming-grid { grid-template-columns: 1fr !important; }
          .heming-header-types { display: none; }
        }
      `}</style>
    </div>
  );
}
