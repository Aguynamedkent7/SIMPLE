import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'One Login',
    short_name: 'One Login',
    description: 'Know where your month stands.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ecede9',
    theme_color: '#ecede9',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
