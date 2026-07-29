'use client';

import { useLayoutEffect } from 'react';

const ROADMAP_STATUSES = ['已开放', '规划中', '资料整理', '后续开放'];
const STAR_NAMES = [
  '紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府',
  '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军',
];
const PALACE_BRANCHES: Record<number, string> = {
  0: '巳', 1: '午', 2: '未', 3: '申',
  4: '辰', 7: '酉',
  8: '卯', 11: '戌',
  12: '寅', 13: '丑', 14: '子', 15: '亥',
};

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

function clarifyPalaceChartPreview() {
  const caption = findExactLeafElements(document, /^(倪海夏排盘法|十二宫地支方位示意)$/).find(element => {
    const container = element.parentElement;
    return Boolean(container?.querySelector('div.grid.grid-cols-4'));
  });
  const container = caption?.parentElement;
  const grid = container?.querySelector<HTMLElement>('div.grid.grid-cols-4');
  if (!caption || !grid) return;

  grid.dataset.chartPreviewGrid = 'true';
  const cells = Array.from(grid.children).filter(
    element => !(element instanceof HTMLElement && element.dataset.chartCenterLabel === 'true'),
  ) as HTMLElement[];

  if (cells.length < 16) return;

  cells.slice(0, 16).forEach((cell, index) => {
    const branch = PALACE_BRANCHES[index];
    if (!branch) return;

    cell.dataset.chartBranchCell = 'true';
    cell.setAttribute('aria-label', `${branch}位`);
    const expected = `<span data-chart-branch-symbol="true">${branch}</span>`;
    if (cell.innerHTML !== expected) cell.innerHTML = expected;
  });

  if (!grid.querySelector('[data-chart-center-label="true"]')) {
    const centerLabel = document.createElement('div');
    centerLabel.dataset.chartCenterLabel = 'true';
    centerLabel.innerHTML = '<strong>十二宫</strong><span>随命宫轮转</span>';
    grid.appendChild(centerLabel);
  }

  if ((caption.textContent ?? '').trim() !== '十二宫地支方位示意') {
    caption.textContent = '十二宫地支方位示意';
  }
}

/**
 * 历史活动公告已经下线。
 *
 * 首页继续保留这个组件入口，用于维护容易过期和需要串联的展示内容：
 * 1. 将写死的月份替换为长期有效的开放状态；
 * 2. 移除旧“5/1—5/8 全免费”活动卡片；
 * 3. 将首屏十四主星入口连接到下方详细解释区；
 * 4. 将空白排盘装饰改成可理解的十二宫地支方位示意。
 */
export default function AnnouncementModal() {
  useLayoutEffect(() => {
    const applyMaintenance = () => {
      updateRoadmapStatuses();
      removeExpiredCampaignCards();
      connectHeroStarsToDetails();
      clarifyPalaceChartPreview();
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

      [data-chart-preview-grid="true"] {
        position: relative;
      }

      [data-chart-branch-cell="true"] {
        font-size: 18px !important;
        font-weight: 600;
        color: var(--ac, #b8892a) !important;
      }

      [data-chart-branch-symbol="true"] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }

      [data-chart-center-label="true"] {
        position: absolute;
        left: calc(25% + 3px);
        top: calc(25% + 3px);
        width: calc(50% - 6px);
        height: calc(50% - 6px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border-radius: 10px;
        border: 1px solid var(--bdr, rgba(184, 146, 42, 0.18));
        background: var(--bg-card, rgba(255, 255, 255, 0.04));
        color: var(--tx-2, rgba(220, 230, 245, 0.78));
        pointer-events: none;
        text-align: center;
      }

      [data-chart-center-label="true"] strong {
        font-size: 13px;
        letter-spacing: 0.14em;
        color: var(--ac, #b8892a);
      }

      [data-chart-center-label="true"] span {
        font-size: 9px;
        letter-spacing: 0.08em;
        color: var(--tx-3, rgba(220, 230, 245, 0.55));
      }
    `}</style>
  );
}
