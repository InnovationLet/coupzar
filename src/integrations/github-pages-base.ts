import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AstroIntegration } from 'astro'

// The theme (astro-pure) ships root-relative links such as `/blog` and `/tags/*`.
// Astro does not prefix those with `base`, so on a GitHub Pages project site
// (served from a sub path) they would point at the domain root. This integration
// rewrites them once the static build is written.
const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.webmanifest', '.json'])
const SKIP_DIRECTORIES = new Set(['pagefind'])
const ATTRIBUTE_RE = /(\s(?:href|src|poster|action)=)(["'])\/(?!\/)([^"']*)/g
const SRCSET_RE = /(\s(?:srcset|imagesrcset)=)(["'])([^"']*)/g
const JSON_KEY_RE = /("(?:src|href|start_url|scope|url)"\s*:\s*")\/(?!\/)([^"]*)/g

function normalizeBase(base: string) {
  return `/${base.replace(/^\/+|\/+$/g, '')}`
}

function withBase(path: string, base: string) {
  return `${base}/${path.replace(/^\/+/, '')}`
}

function isAlreadyPrefixed(path: string, base: string) {
  const root = base.replace(/^\/+/, '')
  return path === root || path.startsWith(`${root}/`)
}

function rewrite(text: string, base: string) {
  const attributes = text.replace(ATTRIBUTE_RE, (match: string, prefix: string, quote: string, path: string) => {
    if (isAlreadyPrefixed(path, base)) return match
    return `${prefix}${quote}${withBase(path, base)}`
  })

  const srcsets = attributes.replace(SRCSET_RE, (_match: string, prefix: string, quote: string, value: string) => {
    const urls = value
      .split(',')
      .map((candidate: string) => {
        const [url, ...descriptor] = candidate.trim().split(/\s+/)
        if (!url || !url.startsWith('/') || url.startsWith('//')) return candidate.trim()
        if (isAlreadyPrefixed(url.slice(1), base)) return candidate.trim()
        return [withBase(url, base), ...descriptor].join(' ')
      })
      .join(', ')
    return `${prefix}${quote}${urls}`
  })

  return srcsets.replace(JSON_KEY_RE, (match: string, prefix: string, path: string) => {
    if (isAlreadyPrefixed(path, base)) return match
    return `${prefix}${withBase(path, base)}`
  })
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      files.push(...(await collectFiles(join(directory, entry.name))))
    } else if (entry.isFile()) {
      files.push(join(directory, entry.name))
    }
  }

  return files
}

export default function githubPagesBase(): AstroIntegration {
  let base = ''

  return {
    name: 'github-pages-base',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = normalizeBase(config.base)
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (!base || base === '/') return

        const root = fileURLToPath(dir)
        let changed = 0

        for (const file of await collectFiles(root)) {
          if (!TEXT_EXTENSIONS.has(extname(file))) continue

          const before = await readFile(file, 'utf8')
          const after = rewrite(before, base)
          if (after !== before) {
            await writeFile(file, after)
            changed++
          }
        }

        logger.info(`prefixed root-relative URLs with "${base}" in ${changed} file(s)`)
      }
    }
  }
}
