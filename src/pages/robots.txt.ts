import type { APIRoute } from 'astro'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const sitemap = new URL(`${base}/sitemap-index.xml`, import.meta.env.SITE).href

const robotsTxt = `
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Claude-Web

User-agent: *
Allow: /

Sitemap: ${sitemap}
`.trim()

export const GET: APIRoute = () =>
  new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  })
