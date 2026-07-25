'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';

const CONSENT_VERSION = '2026-07-25';
const STORAGE_KEY = `ziwei_ai_notice_accepted_${CONSENT_VERSION}`;

interface AiConsentGateProps {
  children: ReactNode;
}

export default function AiConsentGate({ children }: AiConsentGateProps) {
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    try {
      setAccepted(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setAccepted(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || accepted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [ready, accepted]);

  const acceptNotice = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // 浏览器禁用本地存储时，本次会话仍可继续使用。
    }
    setAccepted(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {ready && accepted ? (
          children
        ) : (
          <div
            className="flex h-full min-h-[360px] items-center justify-center rounded-xl border px-6 text-center"
            style={{
              borderColor: 'var(--t-border)',
              background: 'var(--t-card)',
              color: 'var(--t-faint)',
            }}
          >
            <div>
              <div className="mb-3 text-3xl" style={{ color: 'var(--t-gold)', opacity: 0.35 }}>✦</div>
              <p className="text-xs">确认使用须知后，才会开始生成 AI 解读。</p>
            </div>
          </div>
        )}
      </div>

      <div
        className="flex-shrink-0 px-3 py-2.5 text-center"
        style={{ borderTop: '1px solid var(--t-border)', color: 'var(--t-faint)' }}
      >
        <div className="mb-0.5 text-[10px] font-medium tracking-[0.12em]" style={{ color: 'var(--t-gold)' }}>
          AI 生成 · 仅供参考
        </div>
        <p className="text-[9px] leading-relaxed">
          AI解读仅供传统文化学习与个人思考，不构成任何专业建议。
        </p>
      </div>

      {ready && !accepted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-notice-title"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{
            background: 'rgba(2, 8, 16, 0.84)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              borderColor: 'rgba(184,146,42,0.28)',
              background: '#fffaf0',
              color: '#42351f',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            }}
          >
            <div className="border-b px-5 py-4 sm:px-7" style={{ borderColor: 'rgba(184,146,42,0.18)' }}>
              <div className="mb-1 text-[10px] tracking-[0.32em]" style={{ color: '#a98225' }}>
                AI INTERPRETATION NOTICE
              </div>
              <h2 id="ai-notice-title" className="text-xl font-bold tracking-[0.08em]" style={{ color: '#35280f' }}>
                使用须知
              </h2>
            </div>

            <div className="overflow-y-auto px-5 py-5 text-sm leading-7 sm:px-7" style={{ color: '#5b4b32' }}>
              <p className="mb-4">
                本服务提供的紫微斗数排盘与解读内容，由人工智能结合传统文化资料生成。受模型能力、资料来源及输入信息影响，相关内容可能存在错误、遗漏或偏差，平台不保证其准确性、完整性与时效性。
              </p>
              <p className="mb-4">
                紫微斗数属于传统文化研究与个人娱乐参考，不具备经科学验证的预测能力，也不能替代医疗诊断与治疗、心理咨询、法律服务、投资理财、婚姻家庭或职业规划等专业意见。
              </p>
              <p className="mb-4">
                请勿仅依据本服务提供的内容，作出涉及健康、财产、婚姻、工作或其他重要事项的决定。必要时，请咨询具备相应资质的专业人士，并结合现实情况独立判断。
              </p>
              <p className="mb-4">
                最终判断、决定及其产生的后果，由用户本人承担。人生选择权始终掌握在您自己手中。
              </p>
              <p className="rounded-xl px-4 py-3 text-[13px] leading-6" style={{ background: 'rgba(184,146,42,0.08)', color: '#6f5520' }}>
                点击「我已知悉并继续」，即表示您已阅读并理解以上说明，同意在上述范围内使用本服务。
              </p>
            </div>

            <div className="border-t px-5 py-4 sm:px-7" style={{ borderColor: 'rgba(184,146,42,0.18)', background: 'rgba(184,146,42,0.04)' }}>
              <button
                type="button"
                onClick={acceptNotice}
                className="min-h-12 w-full rounded-xl px-5 text-sm font-semibold tracking-[0.08em] transition-transform active:scale-[0.98]"
                style={{
                  border: 'none',
                  background: 'linear-gradient(135deg, #c79a2e, #9b741c)',
                  color: '#fffdf7',
                  boxShadow: '0 6px 18px rgba(155,116,28,0.25)',
                }}
              >
                我已知悉并继续
              </button>

              <div className="mt-3 flex items-center justify-center gap-5 text-[11px]">
                <Link href="/terms" style={{ color: '#8b6a20', textDecoration: 'underline' }}>
                  《服务条款》
                </Link>
                <Link href="/privacy" style={{ color: '#8b6a20', textDecoration: 'underline' }}>
                  《隐私政策》
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
