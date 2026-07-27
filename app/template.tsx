import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div
        style={{
          padding: '12px 20px 20px',
          textAlign: 'center',
          fontSize: '12px',
          lineHeight: 1.7,
          letterSpacing: '0.04em',
          color: 'var(--tx-3)',
          background: 'var(--bg-0)',
        }}
      >
        本项目作者已入驻爱发电
      </div>
    </>
  );
}
