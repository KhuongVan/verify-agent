import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ảnh Thật',
    short_name: 'Ảnh Thật',
    description: 'Thấy thật trước khi mua — hình ảnh/video chụp trực tiếp, không cắt ghép.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#17406e',
    icons: [
      { src: '/logo.png', sizes: '1000x1000', type: 'image/png', purpose: 'any' },
      { src: '/logo.png', sizes: '1000x1000', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
