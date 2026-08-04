import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'haru admin',
  description: 'dev/QA 대시보드',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
