'use client';

import { useLayoutEffect } from 'react';

const ROADMAP_STATUSES = ['已开放', '规划中', '资料整理', '后续开放'];
const STAR_NAMES = [
  '紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府',
  '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军',
];

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

function openDetailedStar(starName: string) {
  const detailButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    const label = (button.textContent ?? '').trim();
    return label === starName && !button.closest('[data-hero-star-grid="true"]');
  });

  if (!detailButton) return;

  detailButton.scrollIntoView({ behavior: 'smooth', block: 'center' });

  window.setTimeout(() => {
    // 已经选中时不要再次点击，否则原组件会把说明收起。
    if (detailButton.style.fontWeight !== '600') detailButton.click();
    detailButton.focus({ preventScroll: true });
  }, 520);
}

function connectHeroStarsToDetails() {
  const heroStarLeaves = STAR_NAMES
    .map(name => findExactLeafElements(document, new RegExp(`^${name}$`)).find(element => {
      const grid = element.closest<HTMLElement>('div.grid');
      return Boolean(grid?.classList.contains('grid-cols-7'));
    }))
    .filter((element): element is HTMLElement => Boolean(element));

  if (heroStarLeaves.length !== STAR_NAMES.length) return;

  const heroGrid = heroStarLeaves[0].closest<HTMLElement>('div.grid');
  if (!heroGrid) return;
  heroGrid.dataset.heroStarGrid = 'true';

  heroStarLeaves.forEach(starLeaf => {
    const starName = (starLeaf.textContent ?? '').trim();
    const entry = starLeaf.parentElement as HTMLElement | null;
    if (!entry || entry.dataset.heroStarEntry === 'true') return;

    entry.dataset.heroStarEntry = 'true';
    entry.setAttribute('role', 'button');
    entry.setAttribute('tabindex', '0');
    entry.setAttribute('aria-label', `查看${starName}星解释`);
    entry.setAttribute('title', `查看${starName}星解释`);

    entry.onclick = () => openDetailedStar(starName);
    entry.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetailedStar(starName);
    };
  });

  const nextElement = heroGrid.nextElementSibling as HTMLElement | null;
  if (nextElement?.dataset.heroStarHint === 'true') return;

  const hint = document.createElement('div');
  hint.dataset.heroStarHint = 'true';
  hint.textContent = '点击任意主星，查看详细解释';
  hint.setAttribute('aria-hidden', 'true');
  heroGrid.insertAdjacentElement('afterend', hint);
}

/**
 * 历史活动公告已经下线。
 *
 * 首页继续保留这个组件入口，用于维护容易过期和需要串联的展示内容：
 * 1. 将写死的月份替换为长期有效的开放状态；
 * 2. 移除旧“5/1—5/8 全免费”活动卡片；
 * 3. 将首页 AI 服务商文案同步为当前实际使用的 DeepSeek；
 * 4. 将首屏十四主星入口连接到下方详细解释区。
 */
export default function AnnouncementModal() {
  useLayoutEffect(() => {
    const applyMaintenance = () => {
      updateRoadmapStatuses();
      removeExpiredCampaignCards();
      correctAiProviderCopy();
      connectHeroStarsToDetails();
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

      [data-hero-star-entry="true"] {
        cursor: pointer;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease !important;
        -webkit-tap-highlight-color: transparent;
      }

      [data-hero-star-entry="true"]:hover,
      [data-hero-star-entry="true"]:focus-visible {
        transform: translateY(-2px) scale(1.03);
        border-color: var(--ac, #b8892a) !important;
        box-shadow: 0 5px 14px rgba(140, 100, 20, 0.14);
        outline: none;
      }

      [data-hero-star-entry="true"]:active {
        transform: scale(0.96);
      }

      [data-hero-star-hint="true"] {
        margin: 10px auto 0;
        color: var(--tx-3, rgba(120, 80, 10, 0.62));
        font-size: 10px;
        line-height: 1.6;
        letter-spacing: 0.16em;
        text-align: center;
      }

      [data-hero-star-hint="true"]::after {
        content: ' ↓';
        color: var(--ac, #b8892a);
      }
    `}</style>
  );
}
