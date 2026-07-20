import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ảnh Thật — Cam kết hình ảnh nguyên bản',
  description: 'Cam kết hình ảnh nguyên bản — bằng chứng quay thật, không cắt ghép.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
