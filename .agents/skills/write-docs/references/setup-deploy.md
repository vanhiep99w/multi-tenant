# Setup & Deploy — Next.js + Fumadocs + Cloudflare Workers

## Prerequisites

- Node.js 18+
- Cloudflare account (free tier OK)
- Wrangler CLI: `npm install -g wrangler`

## Tạo Repo Mới từ Template

```bash
# Option 1: Clone từ aws-learn (recommended)
git clone https://github.com/vanhiep99w/aws-learn my-new-docs
cd my-new-docs
rm -rf .git && git init

# Option 2: Clone từ microservice-learn
git clone https://github.com/vanhiep99w/microservice-learn my-new-docs
```

## Dependencies

`package.json` chuẩn:

```json
{
  "name": "my-docs",
  "type": "module",
  "version": "1.0.0",
  "scripts": {
    "prepare-content": "node scripts/prepare-content.mjs",
    "predev": "node scripts/prepare-content.mjs",
    "dev": "next dev",
    "prebuild": "node scripts/prepare-content.mjs",
    "build": "next build",
    "preview": "wrangler dev",
    "deploy": "npm run build && wrangler deploy"
  },
  "dependencies": {
    "fumadocs-core": "^14.5.6",
    "fumadocs-mdx": "^11.1.3",
    "fumadocs-ui": "^14.5.6",
    "next": "^15.2.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remark-github-admonitions-to-directives": "^2.1.0"
  }
}
```

```bash
npm install
```

## Cloudflare Workers Config

`wrangler.toml` (tối thiểu):

```toml
name = "my-docs-site"
compatibility_date = "2026-03-14"

[assets]
directory = "./dist"
```

**Lưu ý:**
- `name` phải unique trên Cloudflare account
- `directory = "./dist"` — Next.js build output mặc định
- Không cần `routes`, Cloudflare tự handle

## Local Development

```bash
npm run dev        # http://localhost:3000
npm run preview    # Preview với Wrangler (giống production hơn)
```

## Deploy lên Cloudflare

```bash
# Lần đầu: login Wrangler
wrangler login

# Deploy
npm run deploy
# = npm run build && wrangler deploy
# → URL: https://my-docs-site.{account}.workers.dev
```

## Custom Domain (Optional)

Trong Cloudflare Dashboard:
1. Workers & Pages → chọn project
2. Settings → Domains & Routes → Add Custom Domain
3. Nhập domain (phải dùng Cloudflare DNS)

## Build Process Chi tiết

```
npm run build
  ├── prebuild: node scripts/prepare-content.mjs
  │   └── Scan content/docs/ → generate route manifest
  └── next build
      └── Output: .next/ + dist/
          └── Static files ready for Cloudflare
```

## Fumadocs Navigation Config

`content/docs/meta.json` — thứ tự sidebar:
```json
{
  "pages": [
    "fundamentals",
    "compute",
    "database"
  ]
}
```

`content/docs/{category}/meta.json` — tên category:
```json
{
  "title": "Database"
}
```

## Mermaid Diagram Support

Fumadocs không có built-in Mermaid support — cần setup thủ công.

### Cài dependencies

```bash
npm install mermaid unist-util-visit
```

### 1. Tạo remark plugin trong `source.config.ts`

Plugin chuyển ` ```mermaid ` block thành JSX component **trước khi Shiki xử lý**:

```ts
// source.config.ts
import { visit } from 'unist-util-visit';

function remarkMermaid() {
  return (tree: any) => {
    visit(tree, 'code', (node: any, index: any, parent: any) => {
      if (node.lang !== 'mermaid') return;
      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'MermaidDiagram',
        attributes: [{ type: 'mdxJsxAttribute', name: 'chart', value: node.value }],
        children: [],
      };
    });
  };
}

// Thêm vào defineConfig:
export default defineDocs({
  mdxOptions: {
    remarkPlugins: [remarkMermaid],
  },
});
```

> [!IMPORTANT]
> Plugin **phải đặt trong `source.config.ts`**, không phải `next.config.mjs`.
> Fumadocs xử lý MDX content qua `source.config.ts` — đặt trong `next.config.mjs` không có tác dụng.

### 2. Tạo `src/components/mermaid.tsx`

```tsx
'use client';
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    });
  }, [chart]);

  return <div ref={ref} />;
}
```

### 3. Register vào MDX components trong `page.tsx`

```tsx
// src/app/docs/[[...slug]]/page.tsx
import { MermaidDiagram } from '@/components/mermaid';

export default function Page(...) {
  return (
    <DocsPage>
      <DocsBody>
        <MDXContent components={{ MermaidDiagram }} />
      </DocsBody>
    </DocsPage>
  );
}
```

---

## Route Conflict — Next.js 15.5+

Next.js 15.5 không cho phép `src/app/page.tsx` tồn tại cùng `src/app/[[...slug]]/page.tsx`.

**Fix:** Xóa `src/app/page.tsx`, chuyển redirect vào `[[...slug]]/page.tsx`:

```tsx
// src/app/docs/[[...slug]]/page.tsx
export async function generateStaticParams() {
  return [
    { slug: [] },  // ← thêm dòng này để root path hoạt động với output: export
    ...source.generateParams(),
  ];
}

export default function Page({ params }: { params: { slug?: string[] } }) {
  if (!params.slug || params.slug.length === 0) {
    redirect('/docs/fundamentals'); // hoặc trang mặc định
  }
  // ... rest of page
}
```

---

## Mở rộng Content Area

Fumadocs mặc định giới hạn content width ~860px. Để content chiếm hết không gian giữa 2 sidebar:

```css
/* src/app/globals.css */
#nd-page article {
  max-width: none;
}
```

---

## Troubleshooting

| Vấn đề | Nguyên nhân | Fix |
|--------|------------|-----|
| Doc không hiện trong sidebar | Chưa thêm vào meta.json | Thêm file name vào `"pages"` |
| Build lỗi "Cannot find module" | Thiếu dependency | `npm install` |
| Wrangler deploy lỗi auth | Chưa login | `wrangler login` |
| `> [!IMPORTANT]` không render | Thiếu remark plugin | Kiểm tra `remark-github-admonitions-to-directives` trong package.json |
| Mermaid không render | Plugin đặt sai chỗ | Đảm bảo remarkMermaid trong `source.config.ts`, không phải `next.config.mjs` |
| Build lỗi route conflict | Next.js 15.5+ | Xóa `src/app/page.tsx`, xử lý redirect trong `[[...slug]]/page.tsx` |
| Content bị giới hạn width | Fumadocs default CSS | Thêm `#nd-page article { max-width: none }` vào `globals.css` |
