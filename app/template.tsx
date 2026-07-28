import Link from 'next/link';
import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <footer
        style={{
          padding: '18px 20px 26px',
          textAlign: 'center',
          fontSize: '12px',
          lineHeight: 1.8,
          color: 'var(--tx-3)',
          background: 'var(--bg-0)',
          borderTop: '1px solid var(--bdr)',
        }}
      >
        <div>传统文化学习与 AI 辅助解读工具，内容仅供参考，不作为重大决策依据。</div>
        <nav aria-label="站点信息" style={{ marginTop: 6 }}>
          <Link href="/privacy" style={{ color: 'var(--ac)', margin: '0 8px' }}>隐私政策</Link>
          <Link href="/terms" style={{ color: 'var(--ac)', margin: '0 8px' }}>服务条款</Link>
        </nav>
        <div style={{ marginTop: 6 }}>本项目作者已入驻爱发电；赞助与付款由第三方平台处理。</div>
      </footer>
    </>
  );
}
