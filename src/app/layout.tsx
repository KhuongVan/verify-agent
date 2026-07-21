import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ảnh Thật — Thấy thật trước khi mua',
  description: 'Thấy thật trước khi mua — hình ảnh/video chụp trực tiếp, không cắt ghép.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
