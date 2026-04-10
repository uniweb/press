import { defineConfig } from 'vitest/config'

export default defineConfig({
    esbuild: {
        jsx: 'automatic',
    },
    test: {
        environment: 'jsdom',
        globals: false,
        include: ['tests/**/*.test.{js,jsx}'],
    },
})
