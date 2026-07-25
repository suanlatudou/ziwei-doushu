'use client';

/**
 * 历史活动公告已下线。
 *
 * 首页仍保留这个组件入口，避免改动超长主页文件；组件只负责精准隐藏
 * 桌面端和手机端的旧“5/1—5/8 全免费”活动卡片，不再弹出公告。
 */
export default function AnnouncementModal() {
  return (
    <style>{`
      div.absolute.hidden.lg\\:block.pointer-events-none[style*="max-width: 240px"],
      div.lg\\:hidden.mx-auto.mt-8.mb-2.pointer-events-none[style*="max-width: min(280px"] {
        display: none !important;
      }
    `}</style>
  );
}
