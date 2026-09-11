// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-auth-utils',
    '@vueuse/nuxt',
    '@vite-pwa/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-06-30',

  runtimeConfig: {
    // Server-only (override with NUXT_* env vars)
    appUsername: '',
    appPassword: '',
    databaseUrl: '',
    openaiApiKey: '',
    openaiModel: 'gpt-5.4-mini',
    monthlyBudgetUsd: '3',
    cronSecret: '',
    public: {
      appName: 'JLPT Trainer',
      examDate: '2026-12-06'
    }
  },

  nitro: {
    preset: 'vercel',
    vercel: {
      config: {
        regions: ['syd1']
      }
    },
    experimental: {
      tasks: false
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hant' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#fafaf9' }
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap'
        }
      ]
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'JLPT Trainer',
      short_name: 'JLPT',
      description: 'JLPT N3 刷題與記憶曲線練習',
      lang: 'zh-Hant',
      theme_color: '#fafaf9',
      background_color: '#fafaf9',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } }
        }
      ]
    },
    client: {
      installPrompt: false
    },
    devOptions: {
      enabled: false
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
