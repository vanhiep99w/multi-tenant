# Multi-Tenant Documentation

Site tài liệu về kiến trúc Multi-Tenant, xây dựng với Next.js + Fumadocs và deploy trên Cloudflare Workers.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 15
- **Docs Engine**: [Fumadocs](https://fumadocs.vercel.app/)
- **Content**: MDX
- **Deployment**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Language**: TypeScript

## Getting Started

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) để xem kết quả.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production |
| `npm run preview` | Preview với Wrangler |
| `npm run deploy` | Build và deploy lên Cloudflare Workers |

## Project Structure

```
├── content/docs/       # MDX content (generated, ignored by git)
├── src/
│   ├── app/            # Next.js App Router
│   ├── components/     # React components (Mermaid, etc.)
│   └── lib/            # Fumadocs source config
├── scripts/            # Content preparation scripts
├── source.config.ts    # Fumadocs MDX config
├── wrangler.toml       # Cloudflare Workers config
└── package.json
```

## License

MIT
