'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import { generateChart } from '@/lib/ziwei/algorithm';
import { formToBirthInfo } from '@/lib/ziwei/share';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { useTheme } from '@/components/ThemeProvider';

const AI_WORKER_URL = 'https://ziwei-ai-api.730333227.workers.dev/api/interpret';

type CompatibilityType = 'love' | 'business' | 'parentChild' | 'friend';

interface CompatibilityConfig {
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  partyALabel: string;
  partyBLabel: string;
  focusPalaces: string;
  analysisInstruction: string;
  reportStructure: string;
  quickQuestions: string[];
  questionPlaceholder: string;
}

const COMPATIBILITY_TYPES: Record<CompatibilityType, CompatibilityConfig> = {
  love: {
    label: '恋爱婚姻',
    shortLabel: '感情合盘',
    icon: '♡',
    description: '分析双方的吸引模式、情感需求、冲突风险与长期相处方式',
    partyALabel: '甲方',
    partyBLabel: '乙方',
    focusPalaces: '命宫、夫妻宫、福德宫、迁移宫及其三方四正',
    analysisInstruction: '重点判断亲密关系中的吸引、情感表达、安全感、承诺方式、矛盾来源和长期经营方向。',
    reportStructure: `**【关系定性】**
用一句话概括双方亲密关系的核心模式，不使用“注定”“绝对”等表述。

**【相互吸引】**
分析双方容易互相欣赏、支持和产生吸引的地方。

**【情感需求】**
分别说明双方在亲密关系中的主要需求，以及彼此能否理解和满足。

**【冲突风险】**
指出最容易产生误会、争执或压力的地方，并说明冲突形成机制。

**【长期相处】**
分析长期关系中需要重点经营的方面，以及双方适合的相处节奏。

**【沟通建议】**
分别给双方具体、温和、可执行的沟通与相处建议。

**【综合结论】**
总结关系优势与需要共同面对的课题，不以合盘结果替代现实判断。`,
    quickQuestions: ['感情匹配度如何？', '两人结婚需要注意什么？', '谁更需要安全感？', '哪方面最容易产生矛盾？', '怎样沟通最有效？'],
    questionPlaceholder: '继续追问，如：两个人长期相处最需要注意什么？',
  },
  business: {
    label: '事业合作',
    shortLabel: '合作合盘',
    icon: '◇',
    description: '分析能力互补、分工决策、利益边界与长期合作风险',
    partyALabel: '合作方 A',
    partyBLabel: '合作方 B',
    focusPalaces: '命宫、官禄宫、财帛宫、交友宫、迁移宫及其三方四正',
    analysisInstruction: '重点判断双方的做事风格、资源与能力互补、决策权分配、执行方式、利益边界和合作风险。',
    reportStructure: `**【合作定性】**
用一句话概括双方合作关系的核心模式。

**【能力互补】**
分析双方各自擅长的角色、资源和能力，以及能否形成有效互补。

**【分工与决策】**
说明更适合由谁主导方向、谁负责执行，以及重大决策应如何协商。

**【利益与风险】**
分析金钱观、风险偏好、信用边界和利益分配中需要注意的问题。

**【冲突来源】**
指出合作中最容易出现的权责不清、沟通误差或节奏冲突。

**【合作建议】**
给出具体的分工、沟通、合同和风险控制建议。

**【综合结论】**
总结合作优势、前置条件与不适合贸然推进的部分，不替代法律或商业尽调。`,
    quickQuestions: ['适合合伙创业吗？', '双方应该如何分工？', '谁更适合主导决策？', '财务合作要注意什么？', '最容易因为什么闹矛盾？'],
    questionPlaceholder: '继续追问，如：两个人合作时谁更适合管钱？',
  },
  parentChild: {
    label: '亲子关系',
    shortLabel: '亲子合盘',
    icon: '◌',
    description: '分析亲子情感需求、教养互动、沟通障碍与成长支持方式',
    partyALabel: '家长',
    partyBLabel: '孩子',
    focusPalaces: '命宫、父母宫、子女宫、福德宫及其三方四正',
    analysisInstruction: '重点判断家长的教养表达、孩子的情感与成长需求、双方沟通方式、压力来源和支持策略。不得给孩子贴负面人格标签。',
    reportStructure: `**【亲子关系定性】**
用一句话概括双方亲子互动的核心模式。

**【孩子的核心需求】**
分析孩子更需要怎样的认可、安全感、空间和引导方式。

**【家长的教养模式】**
分析家长容易采用的沟通与管教方式，以及可能带来的正面和负面影响。

**【沟通障碍】**
指出双方最容易误解、对抗或彼此失望的环节。

**【成长支持】**
说明家长如何发挥孩子的优势，同时避免过度控制或忽视。

**【相处建议】**
给出具体、温和、符合年龄差异的亲子沟通建议。

**【综合结论】**
总结亲子关系的优势和共同课题，不替代教育、心理或医疗专业意见。`,
    quickQuestions: ['孩子最需要什么支持？', '家长容易在哪方面管得太多？', '怎样沟通孩子更愿意听？', '亲子冲突主要来自哪里？', '如何培养孩子的优势？'],
    questionPlaceholder: '继续追问，如：家长应该怎样减少孩子的抵触？',
  },
  friend: {
    label: '朋友关系',
    shortLabel: '友情合盘',
    icon: '∞',
    description: '分析彼此欣赏、信任边界、冲突方式与长期友谊模式',
    partyALabel: '朋友 A',
    partyBLabel: '朋友 B',
    focusPalaces: '命宫、交友宫、迁移宫、福德宫及其三方四正',
    analysisInstruction: '重点判断双方的相处节奏、信任建立、情绪支持、社交边界、现实互助和友谊中的冲突处理。',
    reportStructure: `**【友情定性】**
用一句话概括双方友谊的核心模式。

**【相互欣赏】**
分析双方为什么容易成为朋友，以及各自带给对方的价值。

**【信任与边界】**
说明彼此在隐私、承诺、金钱、人情和社交距离上的不同需求。

**【冲突风险】**
指出最容易因为什么产生疏远、误解或失望。

**【长期友谊】**
分析这段友谊更适合怎样的联系频率和相处方式。

**【相处建议】**
分别给双方具体、可执行的友谊维护建议。

**【综合结论】**
总结关系优势和需要尊重的边界，不对友谊作绝对结论。`,
    quickQuestions: ['为什么两个人容易成为朋友？', '谁更主动维系关系？', '最容易因为什么疏远？', '金钱往来需要注意什么？', '怎样让友谊更长久？'],
    questionPlaceholder: '继续追问，如：两个人发生矛盾后谁适合先沟通？',
  },
};

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

function isFormReady(form: BirthFormState | null): form is BirthFormState {
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
  compatibilityType: CompatibilityType,
  question?: string,
): string {
  const config = COMPATIBILITY_TYPES[compatibilityType];
  const nameA = formA.name.trim() || config.partyALabel;
  const nameB = formB.name.trim() || config.partyBLabel;
  const followUp = question?.trim();

  return `你现在进行的是紫微斗数双人${config.label}合盘，而不是单人命盘解读。
请严格基于两份紫微斗数命盘中的星曜、宫位互动关系进行分析，不要脱离盘面空谈，也不要套用泛泛的人际关系鸡汤。
系统附带的命盘数据是${config.partyALabel}【${nameA}】的命盘；下面 JSON 是${config.partyBLabel}【${nameB}】的完整命盘数据：

${JSON.stringify(chartB)}

本次合盘类型：${config.label}。
重点对照宫位：${config.focusPalaces}。
分析任务：${config.analysisInstruction}
请同时分析双方，不要只解读其中一方；不得给出宿命式、绝对化结论。

${followUp ? `用户本次追问：${followUp}

请直接回答该问题，明确区分双方，并结合双方命盘中的具体宫位、星曜或四化关系说明依据。` : `请按以下结构输出：

${config.reportStructure}`}

内容仅用于传统文化学习、关系沟通与个人思考参考，不得替代婚姻、教育、心理、法律、医疗、投资、商业尽调或其他重大决策。`;
}

export default function HemingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [compatibilityType, setCompatibilityType] = useState<CompatibilityType>('love');
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

  const currentConfig = COMPATIBILITY_TYPES[compatibilityType];

  const resetAnalysis = useCallback(() => {
    setAnalysis('');
    setQuestion('');
    setAnalysisError(null);
    setFormError(null);
  }, []);

  const handleTypeChange = useCallback((type: CompatibilityType) => {
    if (type === compatibilityType || analyzing) return;
    setCompatibilityType(type);
    resetAnalysis();
  }, [analyzing, compatibilityType, resetAnalysis]);

  const handleFormAChange = useCallback((data: BirthFormState) => {
    setFormA(data);
    setChartA(null);
    resetAnalysis();
  }, [resetAnalysis]);

  const handleFormBChange = useCallback((data: BirthFormState) => {
    setFormB(data);
    setChartB(null);
    resetAnalysis();
  }, [resetAnalysis]);

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

      const prompt = buildCompatibilityPrompt(currentChartB, formA, formB, compatibilityType, requestedQuestion);
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
  }, [chartA, chartB, compatibilityType, formA, formB, noticeAccepted]);

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
        <span style={{ fontSize: '12px', color: 'var(--ac)', letterSpacing: '0.2em' }}>{currentConfig.shortLabel}</span>
        <div style={{ flex: 1 }} />
        <span className="heming-header-types" style={{ fontSize: '11px', color: 'var(--tx-3)' }}>{currentConfig.label}</span>
      </header>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '28px', color: 'var(--ac)', opacity: 0.18, marginBottom: '12px' }}>{currentConfig.icon}</div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '0.15em', color: 'var(--tx-0)', marginBottom: '8px' }}>
            紫微{currentConfig.shortLabel}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
            {currentConfig.description}
          </p>
        </div>

        <section style={{ ...cardStyle, marginBottom: '20px', padding: '18px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', color: 'var(--tx-3)', marginBottom: '12px' }}>选择合盘类型</div>
          <div className="heming-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            {(Object.entries(COMPATIBILITY_TYPES) as [CompatibilityType, CompatibilityConfig][]).map(([type, config]) => {
              const selected = type === compatibilityType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  disabled={analyzing}
                  aria-pressed={selected}
                  style={{
                    minHeight: '74px', padding: '10px 8px', borderRadius: '12px',
                    border: `1px solid ${selected ? 'var(--ac)' : 'var(--bdr-med)'}`,
                    background: selected
                      ? (isDark ? 'rgba(212,168,67,0.13)' : 'rgba(184,146,42,0.12)')
                      : 'transparent',
                    color: selected ? 'var(--ac)' : 'var(--tx-2)',
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    opacity: analyzing && !selected ? 0.55 : 1,
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ fontSize: '19px', lineHeight: 1, marginBottom: '7px' }}>{config.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: selected ? 600 : 500 }}>{config.label}</div>
                </button>
              );
            })}
          </div>
        </section>

        <div style={{
          marginBottom: '20px', padding: '16px 18px', borderRadius: '14px',
          background: isDark ? 'rgba(212,168,67,0.07)' : 'rgba(184,146,42,0.08)',
          border: '1px solid rgba(184,146,42,0.25)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ac)', marginBottom: '6px' }}>合盘使用提示</div>
          <p style={{ fontSize: '12px', lineHeight: 1.75, color: 'var(--tx-2)', marginBottom: '10px' }}>
            合盘属于双人专项 AI 解读，后续将单独计费；当前内测期间暂不扣费。结果仅供传统文化学习、关系沟通与个人思考参考，不代表关系的确定结论，也不应作为婚姻、教育、合作或其他重大决定的唯一依据。
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
            <span style={labelStyle}>{currentConfig.partyALabel} — A</span>
            <BirthForm hideSubmit onSubmit={() => {}} onFormSave={handleFormAChange} />
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>{currentConfig.partyBLabel} — B</span>
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
            <span style={{ color: 'var(--ac)', opacity: 0.6 }}>{currentConfig.icon}</span>
            <span style={{ fontSize: '11px', letterSpacing: '0.25em', color: 'var(--tx-3)' }}>{currentConfig.shortLabel} · AI ANALYSIS</span>
          </div>

          {!analysis && !analyzing && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '13px', color: 'var(--tx-3)', marginBottom: '24px', lineHeight: 1.7 }}>
                填好双方出生信息并确认使用提示后，点击下方按钮<br />
                AI 将按“{currentConfig.label}”方向对照双方完整命盘
              </div>
              <button
                onClick={() => runAnalysis()}
                disabled={analyzing}
                style={{
                  padding: '14px 40px', borderRadius: 'var(--r-pill)', border: 'none',
                  background: 'linear-gradient(135deg, #9a6210, #c88020)',
                  color: '#fff8e8', fontSize: '14px', fontWeight: 600,
                  letterSpacing: '0.12em', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(140,100,20,0.25)',
                }}
              >
                开始{currentConfig.label}合盘
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
              正在生成{currentConfig.label}报告…
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
            <div style={{ fontSize: '10px', color: 'var(--tx-3)', lineHeight: 1.6 }}>合盘内容不代表确定结果，请结合现实相处、专业意见与独立判断。</div>
          </div>
        </div>

        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--tx-3)', marginBottom: '4px' }}>针对本次{currentConfig.label}继续追问</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {currentConfig.quickQuestions.map(item => (
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
            <div className="heming-question-row" style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !analyzing && question.trim()) runAnalysis(question);
                }}
                placeholder={currentConfig.questionPlaceholder}
                disabled={analyzing}
                className="input-base"
                style={{ fontSize: '13px', flex: 1, minWidth: 0 }}
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
          .heming-type-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .heming-header-types { display: none; }
          .heming-question-row { flex-direction: column; }
          .heming-question-row button { width: 100%; }
        }
      `}</style>
    </div>
  );
}
