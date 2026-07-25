'use client';

import { useEffect, useState } from 'react';

const INTEREST_KEY = 'ziwei_deep_report_interest_v1';

export default function DeepReportOffer() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [interested, setInterested] = useState(false);

  useEffect(() => {
    const checkReport = () => setVisible(Boolean(document.querySelector('.score-overview')));
    checkReport();

    const observer = new MutationObserver(checkReport);
    observer.observe(document.body, { childList: true, subtree: true });

    try {
      setInterested(window.localStorage.getItem(INTEREST_KEY) === '1');
    } catch {
      // 浏览器禁用本地存储时仍可正常查看说明。
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const markInterested = () => {
    try {
      window.localStorage.setItem(INTEREST_KEY, '1');
    } catch {
      // 本地存储失败不影响按钮反馈。
    }
    setInterested(true);
  };

  if (!visible) return null;

  return (
    <>
      <section style={{
        maxWidth: '1100px', margin: '-42px auto 80px', padding: '0 24px',
      }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: '18px', padding: '24px',
          border: '1px solid rgba(184,146,42,0.32)',
          background: 'linear-gradient(145deg, rgba(184,146,42,0.10), rgba(255,255,255,0.025))',
          boxShadow: '0 18px 50px rgba(0,0,0,0.08)',
        }}>
          <div aria-hidden="true" style={{
            position: 'absolute', width: '180px', height: '180px', borderRadius: '50%',
            right: '-70px', top: '-90px', background: 'rgba(184,146,42,0.10)', filter: 'blur(2px)',
          }} />

          <div className="deep-offer-header" style={{
            position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.28em', color: 'var(--ac)', marginBottom: '9px' }}>
                深度合盘 · 规划中
              </div>
              <h2 style={{ fontSize: '20px', color: 'var(--tx-0)', marginBottom: '8px', fontWeight: 650 }}>
                当前免费报告已生成
              </h2>
              <p style={{ maxWidth: '650px', fontSize: '12px', lineHeight: 1.75, color: 'var(--tx-2)' }}>
                深度版计划进一步展开双方宫位互动证据、核心关系课题、关键阶段和更具体的行动建议。支付通道尚未接入，当前页面不会收款或扣费。
              </p>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--tx-3)', marginBottom: '2px' }}>预计单次价格</div>
              <div style={{ fontSize: '28px', color: 'var(--ac)', fontWeight: 700 }}>¥9.9</div>
            </div>
          </div>

          <div className="deep-plan-grid" style={{
            position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px',
          }}>
            <div style={{ borderRadius: '13px', padding: '15px', border: '1px solid var(--bdr)', background: 'var(--bg-card)' }}>
              <div style={{ fontSize: '11px', color: 'var(--tx-3)', marginBottom: '9px' }}>当前免费版</div>
              {['AI 互动参考指数', '结构化基础合盘报告', '快捷问题与自定义追问'].map(item => (
                <div key={item} style={{ fontSize: '12px', lineHeight: 1.8, color: 'var(--tx-2)' }}>✓ {item}</div>
              ))}
            </div>

            <div style={{ borderRadius: '13px', padding: '15px', border: '1px solid rgba(184,146,42,0.28)', background: 'rgba(184,146,42,0.055)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ac)', marginBottom: '9px' }}>深度版计划包含</div>
              {['重点宫位互动证据链', '双方关系课题逐项拆解', '关键阶段与风险应对建议', '更详细的个性化行动方案'].map(item => (
                <div key={item} style={{ fontSize: '12px', lineHeight: 1.8, color: 'var(--tx-2)' }}>◇ {item}</div>
              ))}
            </div>
          </div>

          <div className="deep-offer-actions" style={{
            position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginTop: '18px',
          }}>
            <span style={{ fontSize: '10px', lineHeight: 1.6, color: 'var(--tx-3)' }}>
              此处仅展示产品预览；未接支付前，不会产生任何费用。
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              style={{
                padding: '11px 22px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #9a6210, #c88020)', color: '#fff8e8',
                fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              查看深度版说明
            </button>
          </div>
        </div>
      </section>

      {open && (
        <div
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deep-report-title"
            style={{
              width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto',
              borderRadius: '18px', padding: '24px', border: '1px solid var(--bdr-med)',
              background: 'var(--bg-0)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--ac)', letterSpacing: '0.22em', marginBottom: '7px' }}>DEEP REPORT</div>
                <h2 id="deep-report-title" style={{ fontSize: '19px', color: 'var(--tx-0)', marginBottom: '5px' }}>深度合盘报告</h2>
                <div style={{ fontSize: '12px', color: 'var(--tx-3)' }}>预计上线价 ¥9.9 / 次</div>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setOpen(false)}
                style={{ border: 'none', background: 'transparent', color: 'var(--tx-3)', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ height: '1px', background: 'var(--bdr)', margin: '18px 0' }} />

            <p style={{ fontSize: '12px', lineHeight: 1.8, color: 'var(--tx-2)', marginBottom: '15px' }}>
              深度版不是简单把免费报告写长，而是要求 AI 明确列出双方盘面依据，再把关系优势、冲突机制和行动建议一一对应起来。
            </p>

            {[
              ['01', '宫位互动证据', '列出命宫、夫妻宫、福德宫等重点位置的交叉依据。'],
              ['02', '关系课题拆解', '分别说明双方的需求、盲点、触发点和改善方向。'],
              ['03', '关键阶段提示', '围绕关系变化阶段给出观察重点，不作绝对事件预测。'],
              ['04', '行动建议清单', '将建议整理成双方都能执行的具体步骤。'],
            ].map(([number, title, description]) => (
              <div key={number} style={{ display: 'flex', gap: '12px', marginBottom: '13px' }}>
                <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(184,146,42,0.3)', color: 'var(--ac)', fontSize: '10px' }}>{number}</div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--tx-0)', fontWeight: 600, marginBottom: '3px' }}>{title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--tx-3)', lineHeight: 1.65 }}>{description}</div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: '17px', padding: '12px 13px', borderRadius: '11px', border: '1px solid rgba(184,146,42,0.22)', background: 'rgba(184,146,42,0.06)', fontSize: '11px', lineHeight: 1.7, color: 'var(--tx-2)' }}>
              支付功能正在准备中。现在点击下方按钮只会在本设备记录兴趣，不会提交订单、不会收集联系方式，也不会扣款。
            </div>

            <button
              type="button"
              onClick={markInterested}
              disabled={interested}
              style={{
                width: '100%', marginTop: '16px', padding: '12px 16px', borderRadius: '11px',
                border: interested ? '1px solid var(--bdr-med)' : 'none',
                background: interested ? 'var(--bg-card)' : 'linear-gradient(135deg, #9a6210, #c88020)',
                color: interested ? 'var(--tx-2)' : '#fff8e8',
                fontSize: '13px', fontWeight: 600, cursor: interested ? 'default' : 'pointer',
              }}
            >
              {interested ? '已在本设备标记感兴趣' : '我对深度版感兴趣'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 680px) {
          .deep-offer-header { flex-direction: column; }
          .deep-offer-header > div:last-child { text-align: left !important; }
          .deep-plan-grid { grid-template-columns: 1fr !important; }
          .deep-offer-actions { align-items: stretch !important; flex-direction: column; }
          .deep-offer-actions button { width: 100%; }
        }
      `}</style>
    </>
  );
}
