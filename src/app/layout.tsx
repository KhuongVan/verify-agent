import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nguyên Bản — Bằng chứng quay thật',
  description: 'Xác thực media quay thật, không cắt ghép, cho người bán hàng hiệu.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
