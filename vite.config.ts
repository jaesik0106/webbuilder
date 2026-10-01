import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 개발 중에는 올린 이미지(/uploads)를 로컬 Express(3001)에서 가져온다. 배포본은 같은 서버가 바로 보여 준다.
  server: {
    proxy: {
      '/uploads': 'http://localhost:3001',
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
