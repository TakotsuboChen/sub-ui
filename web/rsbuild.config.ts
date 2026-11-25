import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveAppVersion(): string {
  const versionFile = path.resolve(__dirname, '../VERSION')
  if (fs.existsSync(versionFile)) {
    const raw = fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/i, '')
    if (raw) return raw
  }
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
    version?: string
  }
  return (pkg.version || '1.0.0-Alpha-1').replace(/^v/i, '')
}

export default defineConfig(({ envMode }) => {
  const isProd = envMode === 'production'
  const apiTarget = process.env.SUBUI_DEV_API || 'http://127.0.0.1:8080'
  const appVersion = resolveAppVersion()

  return {
    plugins: [pluginReact(), pluginTailwindcss()],
    source: {
      entry: {
        index: './src/main.tsx',
      },
      define: {
        __APP_VERSION__: JSON.stringify(appVersion),
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
