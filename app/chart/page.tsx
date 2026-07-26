'use client';
import { useRef, useState } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import AiConsentGate from '@/components/AiConsentGate';
import { generateChart } from '@/lib/ziwei/algorithm';
import { normalizeBirthForm } from '@/lib/ziwei/birth-normalize';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';

export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const latestForm = useRef<BirthFormState | null>(null);

  if (!chart) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-7 sm:px-5 sm:py-12">
        <h1 className="mb-2 text-2xl font-bold sm:text-[28px]">紫微斗数排盘</h1>
        <p className="mb-7 text-sm leading-7 text-neutral-500 sm:mb-8">
          输入出生年月日时，生成完整紫微命盘。
        </p>
        <BirthForm
          onFormSave={form => {
            latestForm.current = form;
          }}
          onSubmit={() => {
            if (!latestForm.current) return;
            setChart(generateChart(normalizeBirthForm(latestForm.current)));
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-3 py-4 sm:px-4 sm:py-6">
      <button
        type="button"
        onClick={() => {
          setChart(null);
          setSelectedPalace(null);
        }}
        className="mb-4 min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors active:scale-[0.98]"
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
