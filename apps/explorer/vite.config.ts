import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// VITE_BASE is "/explorer/" when this app is assembled into the Serenity site (tools/build-site.mjs).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
