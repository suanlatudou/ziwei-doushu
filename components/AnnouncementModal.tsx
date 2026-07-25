'use client';

import { useLayoutEffect } from 'react';

const ROADMAP_STATUSES = ['已开放', '规划中', '资料整理', '后续开放'];

function findExactLeafElements(root: ParentNode, pattern: RegExp): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(element => {
    if (element.children.length > 0) return false;
    return pattern.test((element.textContent ?? '').trim());
  });
}

function updateRoadmapStatuses() {
  const roadmapHeading = Array.from(document.querySelectorAll<HTMLElement>('section *')).find(
    element => (element.textContent ?? '').trim() === '倪师方法论 · 渐次展开',
  );
  const roadmapSection = roadmapHeading?.closest('section');
  if (!roadmapSection) return;

  const monthLabels = findExactLeafElements(roadmapSection, /^\d{1,2}\s*月$/);
  monthLabels.slice(0, ROADMAP_STATUSES.length).forEach((element, index) => {
    element.textContent = ROADMAP_STATUSES[index];
    element.setAttribute('data-roadmap-status', ROADMAP_STATUSES[index]);
  });
}

function removeExpiredCampaignCards() {
  const campaignDates = findExactLeafElements(document, /^5\/1\s*[—–-]\s*5\/8$/);

  campaignDates.forEach(dateElement => {
    const campaignCard = dateElement.closest<HTMLElement>('.pointer-events-none');
    if (campaignCard?.textContent?.includes('限时回馈')) campaignCard.remove();
  });
}

function correctAiProviderCopy() {
  findExactLeafElements(document, /^倪海夏体系知识库\s*×\s*Claude AI$/).forEach(element => {
    element.textContent = '倪海夏体系知识库 × DeepSeek AI';
  });
}

/**
 * 历史活动公告已经下线。
 *
 * 首页继续保留这个组件入口，用于维护容易过期的展示内容：
 * 1. 将写死的月份替换为长期有效的开放状态；
 * 2. 移除旧“5/1—5/8 全免费”活动卡片；
 * 3. 将首页 AI 服务商文案同步为当前实际使用的 DeepSeek。
 */
export default function AnnouncementModal() {
  useLayoutEffect(() => {
    const applyMaintenance = () => {
      updateRoadmapStatuses();
      removeExpiredCampaignCards();
      correctAiProviderCopy();
    };

    applyMaintenance();

    const observer = new MutationObserver(applyMaintenance);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      div.absolute.hidden.lg\\:block.pointer-events-none[style*="max-width: 240px"],
      div.lg\\:hidden.mx-auto.mt-8.mb-2.pointer-events-none[style*="max-width: min(280px"] {
        display: none !important;
      }
    `}</style>
  );
}
