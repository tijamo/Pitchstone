import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The version in package.json is the single source of truth; the status bar
// reads it through this define rather than pulling package.json into the bundle.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // A production build on Netlify with no Supabase keys would deploy an app
  // that cannot reach its own vault — and would do it quietly, since a missing
  // env var is not a compile error. Fail the build instead, so the previous
  // deploy stays published and the problem is visible in the deploy log.
  if (command === 'build' && process.env.NETLIFY) {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
      (key) => !env[key] && !process.env[key],
    )
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable(s): ${missing.join(', ')}. ` +
          'Set them in the Netlify dashboard under Project configuration → ' +
          'Environment variables, then redeploy.',
      )
    }
  }

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  }
})
