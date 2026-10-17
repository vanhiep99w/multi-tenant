# AGENTS.md

## Project Overview

Site tài liệu về kiến trúc Multi-Tenant. Dùng Next.js 16 + Fumadocs + MDX, deploy trên Cloudflare Workers.

## Tech Stack

- Next.js 16 (App Router)
- Fumadocs (core, mdx, ui)
- TypeScript
- MDX content với D2 + Mermaid và các component từ `@vanhiep99w/docs-kit`
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
- `src/components/` - MDX component map, docs-kit provider, MermaidDiagram
- `src/lib/source.ts` - Fumadocs source configuration
- `scripts/prepare-content.mjs` - Chuẩn bị content metadata cho Fumadocs
- `scripts/build-source-examples.mjs` - Validate references và sinh assets Source Explorer
- `content/assets/d2/` - Icon tin cậy từ icons.d2lang.com, nhúng lúc build
- `source.config.ts` - Fumadocs MDX config (remark plugins)
- `content/docs/` - Markdown/MDX source files được quản lý trong git
- `wrangler.toml` - Cloudflare Workers config

## Conventions

- Content nằm trong `content/docs/` dưới dạng MDX files
- Ưu tiên fence `d2` cho architecture/flow/state phù hợp; giữ Mermaid cho sequence có `alt`/`par`/nhóm pha cần giữ ngữ nghĩa
- Bảng, checklist, log, payload và cây thư mục có thể giữ dạng text
- `docs-kit` có CodeWalkthrough, CodeDiff, ProtocolExchange, TerminalSession, SpanWaterfall; chỉ dùng khi giúp đọc dễ hơn
- Code liên quan dùng metadata `source="project-id" file="path/to/file"`; không duy trì thêm bản code trùng cho Source Explorer
- D2 source link dùng `./?source=...&file=...`, không dùng query-only link vì SDK có thể loại bỏ khi compile
- Icon local resolve tương đối với bài, chỉ lấy từ `content/assets/d2/icons/`; cập nhật URL/hash trong `sources.json` khi đổi icon
- `npm run prepare-content` tự động chạy trước `dev`/`build` để chuẩn bị metadata và source assets; chạy lại khi sửa code trong bài lúc dev server đang mở
- Không import renderer/highlighter build-time vào client component; source/HTML/SVG đều chỉ từ nội dung tin cậy, không chứa secrets
- Build output vào `dist/`, Wrangler serve từ đó

## Content Pipeline

1. MDX source files → `content/docs/`
2. `predev` / `prebuild` chạy metadata preparation + `build-source-examples.mjs`: validate references, highlight code và sinh `public/source-examples/` (gitignored)
3. Fumadocs xử lý MDX qua `source.config.ts`: D2 render/cache bằng Node/WASM, các descriptor docs-kit và Mermaid
4. Next.js static export → `dist/`, gồm cả SVG/HTML và source JSON; không cần runtime D2 trên Cloudflare
5. Wrangler deploy `dist/` theo cấu hình hiện có

## Kiểm thử

```bash
npm test
npm run typecheck
npm run build
CHROME_PATH=/usr/bin/google-chrome npm run test:browser
```

Xem `README.md` để biết cú pháp viết nội dung và giới hạn của pipeline.
