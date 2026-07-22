import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ảnh Thật — Thấy thật trước khi mua',
  description: 'Thấy thật trước khi mua — hình ảnh/video chụp trực tiếp, không cắt ghép.',
};

/**
 * viewportFit: 'cover' là bắt buộc để env(safe-area-inset-*) có giá trị thật.
 * Thiếu nó, mọi padding safe-area trong CSS đều bằng 0 và nội dung bị tai thỏ /
 * thanh vuốt của iPhone che mất.
 *
 * KHÔNG đặt maximumScale: chặn người dùng phóng to là rào cản với người mắt kém.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
