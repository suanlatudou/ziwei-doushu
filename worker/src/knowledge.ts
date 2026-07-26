import { detectPatterns, getMingGongSummary } from '../../lib/ziwei/patterns';
import {
  HEMING_METHODOLOGY,
  MARRIAGE_STARS_BRIEF,
  SIHUA_IN_FUQI_GU,
  STAR_IN_FUQI_GU,
} from '../../lib/ziwei/heming-knowledge';
import type { Palace, ZiweiChart } from '../../lib/ziwei/types';

export type AiMode = 'chart' | 'compatibility';
export const KNOWLEDGE_VERSION = 'v1';

const PALACE_KEYWORDS: Array<[string[], string[]]> = [
  [['感情', '婚姻', '恋爱', '夫妻'], ['夫妻宫', '福德宫', '命宫', '迁移宫']],
  [['事业', '工作', '职业', '创业', '合作'], ['官禄宫', '财帛宫', '交友宫', '迁移宫', '命宫']],
  [['财运', '财富', '收入', '投资', '钱'], ['财帛宫', '田宅宫', '官禄宫', '福德宫']],
  [['健康', '身体', '疾病', '养生'], ['疾厄宫', '福德宫', '命宫']],
  [['父母', '长辈'], ['父母宫', '命宫', '福德宫']],
  [['孩子', '子女', '亲子'], ['子女宫', '父母宫', '福德宫', '命宫']],
  [['朋友', '人际', '贵人', '小人'], ['交友宫', '迁移宫', '命宫']],
];

const DEFAULT_PALACES = ['命宫', '财帛宫', '官禄宫', '迁移宫', '福德宫'];
const SIHUA_LABELS: Record<string, keyof typeof SIHUA_IN_FUQI_GU> = {
  禄: '化禄',
  权: '化权',
  科: '化科',
  忌: '化忌',
};

function isZiweiChart(value: unknown): value is ZiweiChart {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.palaces)
    && typeof record.mingGongBranch === 'number';
}

function majorStarNames(palace: Palace | undefined): string[] {
  if (!palace) return [];
  return palace.stars.filter(star => star.type === 'major').map(star => star.name);
}

function palaceLine(palace: Palace): string {
  const stars = palace.stars
    .filter(star => star.type === 'major' || star.siHua)
    .map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}${star.brightness ? `(${star.brightness})` : ''}`)
    .join('、') || '空宫';
  return `- ${palace.name}：${stars}`;
}

function choosePalaces(prompt: string): string[] {
  const matched = PALACE_KEYWORDS
    .filter(([keywords]) => keywords.some(keyword => prompt.includes(keyword)))
    .flatMap(([, palaces]) => palaces);
  return [...new Set(matched.length ? matched : DEFAULT_PALACES)].slice(0, 7);
}

function chartEvidence(chart: ZiweiChart, prompt: string, label: string): string {
  const lines: string[] = [`【${label}盘面检索结果】`];
  const mingSummary = getMingGongSummary(chart);
  if (mingSummary.stars.length) {
    lines.push(`- 命宫主星：${mingSummary.stars.join('、')}；关键词：${mingSummary.keywords.join('、') || '无'}；星性：${mingSummary.nature || '未定'}`);
  }

  try {
    const patterns = detectPatterns(chart).slice(0, 8);
    if (patterns.length) {
      lines.push('- 已识别格局：');
      for (const pattern of patterns) {
        const conditions = pattern.conditions?.required?.join('；');
        lines.push(`  · ${pattern.name}（${pattern.level}）：${pattern.description}${conditions ? `；成立依据：${conditions}` : ''}${pattern.source ? `；出处：${pattern.source}` : ''}`);
      }
    }
  } catch {
    lines.push('- 格局识别暂不可用，请仅依据宫位和星曜分析。');
  }

  const wanted = new Set(choosePalaces(prompt));
  const palaces = chart.palaces.filter(palace => wanted.has(palace.name));
  if (palaces.length) {
    lines.push('- 与本次问题最相关的宫位：');
    lines.push(...palaces.map(palaceLine));
  }

  const transformations = chart.palaces.flatMap(palace => palace.stars
    .filter(star => star.siHua)
    .map(star => `${star.name}化${star.siHua}在${palace.name}`));
  if (transformations.length) {
    lines.push(`- 生年四化落点：${transformations.join('；')}`);
  }

  return lines.join('\n');
}

function spouseKnowledge(chart: ZiweiChart, label: string): string[] {
  const palace = chart.palaces.find(item => item.name === '夫妻宫');
  if (!palace) return [];

  const lines: string[] = [`【${label}夫妻宫知识命中】`];
  for (const star of palace.stars.filter(item => item.type === 'major')) {
    const entry = STAR_IN_FUQI_GU[star.name];
    if (entry) {
      lines.push(`- ${star.name}：${entry.summary}；吉象：${entry.good}；注意：${entry.bad}；相处特征：${entry.spouse_traits}；时机：${entry.timing}`);
    }
    if (star.siHua) {
      const key = SIHUA_LABELS[star.siHua];
      if (key && SIHUA_IN_FUQI_GU[key]) lines.push(`- ${star.name}化${star.siHua}：${SIHUA_IN_FUQI_GU[key]}`);
    }
  }

  for (const star of palace.stars) {
    const brief = MARRIAGE_STARS_BRIEF[star.name];
    if (brief) lines.push(`- ${star.name}：${brief}`);
  }

  return lines.length > 1 ? lines : [];
}

function retrieveMethodology(prompt: string): string {
  const sections = HEMING_METHODOLOGY.split(/\n(?=###\s)/g);
  const keywords = prompt.includes('合作') || prompt.includes('事业')
    ? ['事业合作', '五步法', '双宫联参']
    : prompt.includes('亲子') || prompt.includes('孩子')
      ? ['双宫联参', '五步法']
      : ['双宫联参', '天作之合', '五步法', '缘分类型'];

  const selected = sections.filter(section => keywords.some(keyword => section.includes(keyword)));
  return selected.join('\n').slice(0, 5000);
}

export function buildKnowledgeContext(
  chartValue: unknown,
  secondaryChartValue: unknown,
  prompt: string,
  mode: AiMode,
): string {
  if (!isZiweiChart(chartValue)) return '';

  const chunks = [chartEvidence(chartValue, prompt, mode === 'compatibility' ? '甲方' : '本命')];

  if (mode === 'compatibility' && isZiweiChart(secondaryChartValue)) {
    chunks.push(chartEvidence(secondaryChartValue, prompt, '乙方'));
    chunks.push(...spouseKnowledge(chartValue, '甲方'));
    chunks.push(...spouseKnowledge(secondaryChartValue, '乙方'));
    const methodology = retrieveMethodology(prompt);
    if (methodology) chunks.push(`【合盘方法论检索片段】\n${methodology}`);

    const aMing = majorStarNames(chartValue.palaces.find(item => item.name === '命宫'));
    const bMing = majorStarNames(secondaryChartValue.palaces.find(item => item.name === '命宫'));
    const aSpouse = majorStarNames(chartValue.palaces.find(item => item.name === '夫妻宫'));
    const bSpouse = majorStarNames(secondaryChartValue.palaces.find(item => item.name === '夫妻宫'));
    chunks.push(`【双盘快速对照】\n- 甲方命宫：${aMing.join('、') || '空宫'}；夫妻宫：${aSpouse.join('、') || '空宫'}\n- 乙方命宫：${bMing.join('、') || '空宫'}；夫妻宫：${bSpouse.join('、') || '空宫'}`);
  }

  return chunks.join('\n\n').slice(0, 12000);
}
