import type { MetadataRoute } from 'next';
import { primitives } from '@/design/tokens';

/** PWA: на iPhone push працює лише з головного екрана, тому застосунок має бути «встановлюваним» */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OnniMart',
    short_name: 'OnniMart',
    start_url: '/',
    display: 'standalone',
    background_color: primitives['slate/50'],
    theme_color: primitives['slate/50'],
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
