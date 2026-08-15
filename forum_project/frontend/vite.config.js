import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发期：前端 :5173，/api 与 /uploads 代理到 Flask :5000（同源，规避 CORS/cookie 问题）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
})
