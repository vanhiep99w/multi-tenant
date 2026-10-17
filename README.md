# Multi-Tenant Documentation

Tài liệu kiến trúc Multi-Tenant bằng tiếng Việt, dùng Next.js 16 + Fumadocs/MDX, static export lên Cloudflare.

## Chạy và kiểm tra

Yêu cầu **Node.js ≥ 22**.

```bash
npm ci
npm run dev       # http://localhost:3000
npm test          # Pipeline source, reference, HTML escaping và icon
npm run typecheck
npm run build     # Static site trong dist/
```

| Lệnh | Công dụng |
| --- | --- |
| `npm run prepare-content` | Chuẩn bị metadata, validate source references và sinh assets Source Explorer |
| `npm run preview` | Preview `dist/` bằng Wrangler |
| `npm run deploy` | Build và deploy bằng cấu hình Wrangler hiện có |
| `npm run test:browser` | Kiểm tra static export với Playwright; chạy sau build |

Browser test dùng Chromium đã cài qua Playwright hoặc Chrome local:

```bash
CHROME_PATH=/usr/bin/google-chrome npm run test:browser
# Tùy chọn: lưu ảnh kiểm tra giao diện ra ngoài repo
CHROME_PATH=/usr/bin/google-chrome DOCS_SCREENSHOTS=/tmp/docs-screenshots npm run test:browser
```

## Cấu trúc

```text
content/docs/                 # Nội dung Markdown được xử lý bằng MDX, quản lý trong git
content/assets/d2/            # Icon từ icons.d2lang.com và thông tin nguồn
src/components/docs-kit.tsx   # Map component MDX, không import build-time renderer
src/components/docs-kit-provider.tsx
scripts/build-source-examples.mjs
scripts/lib/source-examples.mjs
scripts/tests/
source.config.ts              # Remark plugins chạy lúc build
public/source-examples/       # JSON được sinh tự động, không commit
```

## Viết sơ đồ D2

Dùng `@vanhiep99w/docs-kit` cho sơ đồ kiến trúc, flow và state machine phù hợp. Các sơ đồ có Explore để fit/zoom/pan, mở rộng và xem/copy D2. Mermaid được giữ cho sequence có nhánh `alt`, `par` hoặc nhóm pha mà chuyển đổi có thể làm mất ngữ nghĩa. Bảng, checklist, log, payload và cây thư mục không cần ép thành diagram.

````md
```d2 title="Luồng truy cập dữ liệu"
direction: right
client: Client
api: API
database: PostgreSQL {
  shape: cylinder
  icon: ../assets/d2/icons/postgresql.svg
}
client -> api -> database
```
````

- Icon resolve tương đối với **file bài viết**: bài trong `content/docs/02-isolation-models/` dùng `../../assets/d2/icons/...`.
- Chỉ dùng icon khi nhận diện công nghệ cụ thể; không gắn logo cloud vào flow quyết định chung chung.
- Icon gốc, URL và SHA-256 được ghi tại `content/assets/d2/sources.json`. Icon được nhúng lúc build, không tải từ bên thứ ba khi đọc.
- Các kiến trúc lớn trong bài Cloud và Case Study dùng `mode=explorer`: mở tổng quan trước, chọn board `topology` để xem toàn bộ kết nối. Không thu nhỏ chữ để ép mọi thành phần vào một hình.
- Render D2/WASM chỉ chạy trên Node lúc build; không thêm compiler vào browser hay Cloudflare runtime. Cache ở `.next/cache/docs-kit/d2`, không phải assets deploy.
- Chỉ compile D2/MDX và SVG do tác giả tin cậy quản lý. Không nhận source/SVG không tin cậy hoặc chứa secrets.

## Source Explorer: một nguồn code duy nhất

Đánh dấu các code fence liên quan bằng `source` và `file`. Pipeline lấy **chính nội dung fence đó**, highlight bằng Shiki, tạo manifest và file tree. Remark tự chèn nút mở source; không cần copy code sang thư mục examples khác.

````md
```java source="tenant-identity" file="src/context/TenantContextHolder.java"
public class TenantContextHolder {
    // Trích đoạn minh họa trong bài.
}
```

<SourceRef project="tenant-identity" file="src/context/TenantContextHolder.java" lines="1-3">
  Xem context holder
</SourceRef>
````

Chọn ID project ổn định theo chủ đề bài viết. `file` là đường dẫn hiển thị của trích đoạn, **không phải đường dẫn để đọc filesystem**. Một project có nhiều file nhưng không được khai báo trùng file trong cùng snapshot. Các ví dụ là trích đoạn phục vụ tra cứu, không phải ứng dụng có thể chạy độc lập.

Snapshot mặc định là `guide`. Chọn một vùng bằng `lines="start-end"`, tính từ 1 và bao gồm dòng cuối. Pipeline hiện không khai báo named regions; reference tới region không tồn tại sẽ làm build thất bại.

Node D2 có thể mở implementation trong drawer:

````md
```d2 title="Context trong request"
context: TenantContextHolder {
  link: "./?source=tenant-identity&file=src/context/TenantContextHolder.java&lines=1-3"
  tooltip: "Mở code triển khai"
}
```
````

Dùng `./?source=...` thay vì chỉ `?source=...`: SDK D2 hiện tại có thể loại bỏ query-only link khi compile. Provider bắt link cùng bài, giữ drawer tại chỗ và reset khi điều hướng sang bài khác.

Assets được sinh trước `dev`/`build`. Khi **thêm hoặc sửa nội dung code** trong lúc dev server đang chạy, chạy lại `npm run prepare-content` để cập nhật source drawer. Không sửa JSON đã sinh. Khi build, project/file/snapshot/line references sai hoặc trùng sẽ báo lỗi thay vì xuất link hỏng. Drawer chỉ tải manifest/code khi mở; các assets này công khai, không đưa secrets vào ví dụ.

## Các component khác đang dùng

| Component / fence | Bài áp dụng | Mục đích |
| --- | --- | --- |
| `CodeWalkthrough` / `code-walkthrough` | Tenant Identity | Đọc từng bước capture, restore, cleanup và đăng ký TaskDecorator |
| `CodeDiff` / `code-diff` | Isolation Techniques | So sánh SQL trước/sau khi thêm tenant filter |
| `ProtocolExchange` / `protocol-exchange` | Tenant Identity | HTTP hợp lệ và từ chối tenant header không khớp JWT |
| `TerminalSession` / `terminal-session` | Compute Isolation | Lệnh tạo, kết nối và kiểm tra vCluster |
| `SpanWaterfall` / `span-waterfall` | Observability | Đọc timeline latency minh họa theo tenant |

Fence chứa YAML descriptor theo API của package. Walkthrough/diff có `source` trong snapshot/phiên bản sẽ tự xuất code hiển thị sang Source Explorer và dùng adapter tương ứng; không cần thêm bản code trùng.

Không component nào thực thi code, chạy lệnh, gửi HTTP request hay lấy trace production. Output/response/trace thêm vào tài liệu phải ghi rõ là minh họa hay đo thực tế. Tất cả nội dung vẫn đọc được từ static HTML khi không có JavaScript; các thao tác như zoom, đổi bước, copy và drawer cần JavaScript.

## License

MIT. Logo/nhãn hiệu công nghệ thuộc chủ sở hữu tương ứng; xem `content/assets/d2/README.md` khi tái sử dụng icon.
