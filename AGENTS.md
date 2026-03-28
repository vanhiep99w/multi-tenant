# AGENTS.md

## Project Overview

Site tài liệu về kiến trúc Multi-Tenant. Dùng Next.js 15 + Fumadocs + MDX, deploy trên Cloudflare Workers.

## Tech Stack

- Next.js 15 (App Router)
- Fumadocs (core, mdx, ui)
- TypeScript
- MDX content với Mermaid diagram support
- Cloudflare Workers (Wrangler)

## Common Commands

```bash
npm run dev        # Dev server (port 3000)
npm run build      # Production build
npm run preview    # Wrangler dev preview
npm run deploy     # Build + deploy to Cloudflare Workers
```

## Project Structure

- `src/app/` - Next.js App Router pages và layouts
- `src/components/` - React components (MermaidDiagram, etc.)
- `src/lib/source.ts` - Fumadocs source configuration
- `scripts/prepare-content.mjs` - Chuẩn bị content metadata cho Fumadocs
- `source.config.ts` - Fumadocs MDX config (remark plugins)
- `content/docs/` - MDX source files (generated, gitignored)
- `wrangler.toml` - Cloudflare Workers config

## Conventions

- Content nằm trong `content/docs/` dưới dạng MDX files
- Mermaid diagrams dùng code block ```` ```mermaid ```` trong MDX
- `scripts/prepare-content.mjs` tự động chạy trước `dev` và `build` để tạo `meta.json` cho categories
- Build output vào `dist/`, Wrangler serve từ đó

## Content Pipeline

1. MDX source files → `content/docs/`
2. `npm run predev` / `npm run prebuild` chạy `prepare-content.mjs` để tạo meta.json
3. Fumadocs xử lý MDX qua `source.config.ts` (remark plugins cho Mermaid)
4. Next.js build output → `dist/`
5. Wrangler deploy `dist/` lên Cloudflare Workers
