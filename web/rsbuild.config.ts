import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ envMode }) => {
  const isProd = envMode === 'production'
  const apiTarget = process.env.SUBUI_DEV_API || 'http://127.0.0.1:8080'

  return {
    plugins: [pluginReact(), pluginTailwindcss()],
    source: {
      entry: {
        index: './src/main.tsx',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    html: {
      template: './index.html',
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/s': { target: apiTarget, changeOrigin: true },
      },
    },
    output: {
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
    },
  }
})
