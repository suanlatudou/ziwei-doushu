'use client';
import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import AiConsentGate from '@/components/AiConsentGate';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

/**
 * 命盘页 —— 开源版「排盘引擎 Demo」
 *
 * 这是一个最小可运行示例：用本仓库的排盘引擎 generateChart() 配合基础 UI
 * 组件，渲染一张完整紫微命盘 + 基础解读，并支持本命 / 大限 / 流年切换。
 *
 * 说明：线上商业版的完整交互界面（重设计的新 UI、AI 流式解读、合盘、分享
 * 卡片等）不在开源范围内；但排盘内核——安星算法、四化、格局识别、古籍库——
 * 完全开放（见 lib/ziwei/*），可自由二次开发出你自己的界面。
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-7 sm:px-5 sm:py-12">
        <h1 className="mb-2 text-2xl font-bold sm:text-[28px]">紫微斗数排盘</h1>
        <p className="mb-7 text-sm leading-7 text-neutral-500 sm:mb-8">
          输入出生年月日时，开源排盘引擎即时生成命盘。
          <br />
          （本页为引擎 Demo，完整商业版界面不在开源范围；排盘内核完全开放。）
        </p>
        <BirthForm onSubmit={(info: BirthInfo) => setChart(generateChart(info))} />
      </main>
    );
  }

  // ── 已起盘：命盘 + 解读 ──
  return (
    <main className="mx-auto w-full max-w-[1280px] px-3 py-4 sm:px-4 sm:py-6">
      <button
        type="button"
        onClick={() => {
          setChart(null);
          setSelectedPalace(null);
        }}
        className="mb-4 min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors active:scale-[0.98]"
        style={{
          cursor: 'pointer',
          borderColor: 'var(--t-border)',
          background: 'var(--t-card)',
          color: 'var(--t-text)',
        }}
      >
        ← 重新起盘
      </button>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:items-start">
        <section className="min-w-0">
          <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        </section>

        <section className="h-[68vh] min-h-[520px] min-w-0 sm:h-[620px] xl:sticky xl:top-4 xl:h-[720px]">
          <AiConsentGate>
            <InsightPanel chart={chart} selectedPalace={selectedPalace} />
          </AiConsentGate>
        </section>
      </div>
    </main>
  );
}
