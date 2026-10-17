---
title: "Tổng quan Multi-Tenancy"
description: "Multi-Tenancy là gì, so sánh Single-Tenant vs Multi-Tenant, tại sao cần và các thách thức chính khi xây dựng hệ thống multi-tenant"
---

# Tổng quan Multi-Tenancy

## Mục lục

- [Multi-Tenancy là gì?](#multi-tenancy-là-gì)
- [Thuật ngữ cốt lõi](#thuật-ngữ-cốt-lõi)
- [Phân biệt Tenant vs User vs Organization](#phân-biệt-tenant-vs-user-vs-organization)
- [Single-Tenant vs Multi-Tenant](#single-tenant-vs-multi-tenant)
- [Tại sao cần Multi-Tenancy?](#tại-sao-cần-multi-tenancy)
- [Các thách thức chính](#các-thách-thức-chính)
- [Tổng kết — Risk Matrix](#tổng-kết--risk-matrix)

---

## Multi-Tenancy là gì?

**Multi-Tenancy** là một mô hình kiến trúc phần mềm trong đó **một instance duy nhất** của ứng dụng phục vụ **nhiều khách hàng (tenant)** đồng thời. Mỗi tenant chia sẻ cùng hạ tầng, codebase và tài nguyên hệ thống, nhưng dữ liệu và cấu hình của họ được **cách ly logic** với nhau.

```d2 title="Kiến trúc Multi-Tenant"
direction: down
a: Tenant A
b: Tenant B
c: Tenant C
d: Tenant D
shared: "Hạ tầng dùng chung / Dữ liệu cách ly" {
  services: Shared Services
  compute: Shared Compute
  network: Shared Network
}
a -> shared
b -> shared
c -> shared
d -> shared
```

> [!IMPORTANT]
> Multi-Tenancy là nền tảng kiến trúc của hầu hết sản phẩm SaaS hiện đại (Slack, Shopify, Salesforce, Jira). Hiểu rõ kiến trúc này là điều kiện tiên quyết để thiết kế hệ thống SaaS có thể scale.

---

## Thuật ngữ cốt lõi

| Thuật ngữ                        | Định nghĩa                                                                                                   | Ví dụ                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Tenant**                       | Một đơn vị tổ chức (thường là công ty/tổ chức) sử dụng hệ thống. Một tenant có thể chứa nhiều users          | Công ty ACME đăng ký dùng Slack → ACME là 1 tenant |
| **Tenant ID**                    | Định danh duy nhất (UUID/string) gắn với mỗi tenant, xuyên suốt toàn bộ hệ thống                             | `tenant_id = "acme-corp-uuid-1234"`                |
| **Tenant Context**               | Thông tin tenant hiện tại được truyền qua các layer trong một request                                        | JWT claim, HTTP header, ThreadLocal                |
| **Tenant Isolation**             | Cơ chế đảm bảo tenant A không thể truy cập dữ liệu/tài nguyên của tenant B                                   | Database riêng, Row-Level Security, Network Policy |
| **Tenant Tier**                  | Phân loại tenant theo mức dịch vụ (Free/Pro/Enterprise) — ảnh hưởng đến mức isolation và resource allocation | Free → shared DB; Enterprise → dedicated DB        |
| **Noisy Neighbor**               | Hiện tượng một tenant sử dụng quá nhiều tài nguyên, làm ảnh hưởng hiệu năng của các tenant khác              | Tenant A chạy query nặng → tenant B bị chậm        |
| **Cross-Tenant Data Leak**       | Lỗi bảo mật khi dữ liệu của tenant A bị lộ cho tenant B                                                      | Thiếu `WHERE tenant_id = ?` trong query            |
| **SaaS** (Software as a Service) | Mô hình phân phối phần mềm qua cloud, thường sử dụng multi-tenancy                                           | Slack, Salesforce, Jira, Shopify                   |

---

## Phân biệt Tenant vs User vs Organization

```d2 title="User thuộc tenant, tenant đại diện tổ chức"
direction: right
platform: "SaaS Platform — ranh giới tenant = ranh giới cách ly" {
  acme: "Tenant A / ACME Corp" {
    john: "John · Admin"
    jane: "Jane · User"
  }
  beta: "Tenant B / Beta Inc" {
    bob: "Bob · Admin"
    alice: "Alice · User"
  }
}
```

**Quy tắc quan trọng:**

- **Tenant** = ranh giới cách ly dữ liệu và tài nguyên (thường = 1 tổ chức/công ty)
- **User** = cá nhân thuộc về một tenant, có role/permission riêng
- **Organization** = có thể đồng nghĩa với tenant, hoặc là cấp trên/dưới tùy thiết kế
- Một user **chỉ thuộc 1 tenant** (mô hình đơn giản) hoặc **thuộc nhiều tenant** (mô hình phức tạp — Slack, Notion)

---

## Single-Tenant vs Multi-Tenant

### Kiến trúc Single-Tenant

Mỗi khách hàng có **instance riêng** của toàn bộ ứng dụng: codebase, database, infra tách biệt hoàn toàn.

```d2 title="Single-Tenant: mỗi khách hàng một instance"
direction: right
a: "Tenant A" {
  app: "Application"
  db: "Database riêng" {shape: cylinder}
  app -> db
}
b: "Tenant B" {
  app: "Application"
  db: "Database riêng" {shape: cylinder}
  app -> db
}
c: "Tenant C" {
  app: "Application"
  db: "Database riêng" {shape: cylinder}
  app -> db
}
```

### Kiến trúc Multi-Tenant

Tất cả khách hàng chia sẻ **cùng một instance** của ứng dụng, dữ liệu được cách ly bằng logic.

```d2 title="Multi-Tenant: dùng chung ứng dụng, cách ly dữ liệu"
direction: down
app: "Application Layer\nTenant Context → Route → Process"
db: "Shared Database — cách ly logic" {
  a: Dữ liệu tenant A
  b: Dữ liệu tenant B
  c: Dữ liệu tenant C
  d: Dữ liệu tenant D
}
app -> db
```

### Bảng so sánh toàn diện

| Tiêu chí             |                Single-Tenant                |                   Multi-Tenant                   |
| -------------------- | :-----------------------------------------: | :----------------------------------------------: |
| **Kiến trúc**        |           1 instance / 1 customer           |             1 instance / N customers             |
| **Chi phí hạ tầng**  |   🔴 Cao — nhân bản mọi thứ theo số khách   |           🟢 Thấp — chia sẻ tài nguyên           |
| **Chi phí vận hành** |         🔴 Cao — quản lý N hệ thống         |           🟢 Thấp — quản lý 1 hệ thống           |
| **Data Isolation**   |       🟢 Mạnh nhất — vật lý tách biệt       |    🟡 Phụ thuộc chiến lược — logic isolation     |
| **Customization**    |     🟢 Tùy biến thoải mái per customer      | 🟡 Giới hạn — phải thiết kế configuration system |
| **Security Risk**    |         🟢 Thấp — không chia sẻ gì          |      🔴 Cao hơn — rủi ro cross-tenant leak       |
| **Performance**      |      🟢 Ổn định — không noisy neighbor      |          🟡 Cần quản lý noisy neighbor           |
| **Scalability**      |   🔴 Khó scale — phải clone per customer    |      🟢 Dễ scale — thêm tenant = thêm data       |
| **Time-to-Market**   |    🔴 Chậm — mỗi customer = 1 deployment    |     🟢 Nhanh — onboard tenant mới trong phút     |
| **Update/Patch**     |        🔴 Phải update từng instance         |            🟢 Update 1 lần cho tất cả            |
| **Compliance**       |       🟢 Dễ đáp ứng — data riêng biệt       |       🟡 Phức tạp — cần thiết kế cẩn thận        |
| **Phù hợp cho**      | On-premise, Enterprise lớn, ngành regulated |            SaaS, startup, scale nhanh            |

### Khi nào chọn Single-Tenant?

```d2 title="Khi nào chọn Single-Tenant?"
direction: down
A: "Yêu cầu dự án"
B: "Compliance cực kỳ nghiêm ngặt?" {shape: diamond}
C: "Single-Tenant ✅"
D: "Khách hàng yêu cầu\ninfra riêng biệt?" {shape: diamond}
E: "Số lượng khách hàng < 10\nvà mỗi khách rất lớn?" {shape: diamond}
F: "Cần customization\ncực kỳ sâu per customer?" {shape: diamond}
G: "Multi-Tenant ✅"
A -> B
B -> C: "Có"
B -> D: "Không"
D -> C: "Có"
D -> E: "Không"
E -> C: "Có"
E -> F: "Không"
F -> C: "Có"
F -> G: "Không"
```

---

## Tại sao cần Multi-Tenancy?

### Business Drivers

**① Hiệu quả chi phí (Cost Efficiency)**

Multi-Tenancy là nền tảng kinh tế của mô hình SaaS:

```
Single-Tenant (100 khách hàng):
┌──────────────────────────────────────────┐
│  100 × Server    = 100 servers           │
│  100 × Database  = 100 DB instances      │
│  100 × Ops team  = huge ops overhead     │
│  Chi phí: $$$$$$$$$$                     │
└──────────────────────────────────────────┘

Multi-Tenant (100 khách hàng):
┌──────────────────────────────────────────┐
│  2-3 × Server cluster = auto-scaled      │
│  1-3 × Database       = shared/pooled    │
│  1 × Ops pipeline     = automated        │
│  Chi phí: $$$                            │
└──────────────────────────────────────────┘

→ Tiết kiệm 60-80% chi phí hạ tầng
```

**② Tốc độ phát triển sản phẩm (Time-to-Market)**

- Onboard tenant mới trong **phút** thay vì **ngày/tuần**
- Một codebase → một CI/CD pipeline → deploy cho tất cả tenant
- Bug fix / feature release đồng thời cho toàn bộ khách hàng
- A/B testing dễ dàng: feature flag per tenant

**③ Khả năng mở rộng (Scalability)**

- Thêm 1000 tenant mới ≠ thêm 1000 server mới
- Horizontal scaling dựa trên tổng load, không phải per-customer
- Resource pooling tối ưu hóa utilization
- Elastic scaling theo actual demand

**④ Operational Excellence**

- Monitoring tập trung — 1 dashboard cho toàn hệ thống
- Schema migration 1 lần cho tất cả (trong shared model)
- Security patching nhanh và đồng nhất
- Giảm DevOps overhead đáng kể

### Ví dụ thực tế

| SaaS Product       | Multi-Tenant Model                                | Số tenant     | Ghi chú                                                  |
| ------------------ | ------------------------------------------------- | ------------- | -------------------------------------------------------- |
| **Salesforce**     | Shared DB + Metadata-driven schema                | 150,000+ orgs | Tenant customization qua metadata, không thay đổi schema |
| **Slack**          | Shared infrastructure, sharded DB                 | 750,000+ orgs | Shard by tenant cho performance                          |
| **Shopify**        | Sharded DB, pod-based isolation                   | 2M+ shops     | Mỗi "pod" chứa ~10K shops, dedicated DB shard            |
| **Jira/Atlassian** | Shared infra (cloud), per-tenant DB (data center) | 200,000+      | Hybrid model tùy deployment                              |
| **AWS Cognito**    | Shared compute, per-tenant User Pool              | Millions      | Pool-based isolation cho identity                        |

---

## Các thách thức chính

Multi-Tenancy mang lại lợi ích lớn nhưng đi kèm **5 nhóm thách thức trọng yếu**:

### Thách thức 1: Data Isolation & Security

```
⚠️ VẤN ĐỀ NGHIÊM TRỌNG NHẤT

Một dòng code thiếu sót có thể lộ data toàn bộ tenant:

  ❌ SELECT * FROM orders;                         → Lộ data mọi tenant
  ✅ SELECT * FROM orders WHERE tenant_id = ?;     → Chỉ data tenant hiện tại

Điều này phải được enforce ở:
  • Application layer (middleware, ORM filter)
  • Database layer (Row-Level Security, schema)
  • Infrastructure layer (network, IAM)
  • API layer (authorization check)
```

**Rủi ro cụ thể:**

- **Cross-tenant data leak**: Query thiếu `tenant_id` filter
- **Cache poisoning**: Cache key không chứa tenant → trả data sai tenant
- **Shared file storage leak**: Upload/download file không validate tenant
- **Log leakage**: Log chứa sensitive data của tenant khác
- **API response leak**: Serialization lỗi trả data cross-tenant

> [!CAUTION]
> Cross-tenant data leak là lỗi **catastrophic** — có thể dẫn đến vi phạm GDPR/HIPAA, mất niềm tin khách hàng, và kiện tụng. Phải được xử lý ở **nhiều layer** (defense in depth).

### Thách thức 2: Noisy Neighbor

```d2 title="Noisy Neighbor khi chưa có giới hạn tài nguyên"
direction: right
a: "Tenant A\n10 requests/giây"
b: "Tenant B\n10.000 requests/giây"
pool: "Shared Resource Pool\nTenant B chiếm 90% CPU"
result: "Tenant A: 200 → 5000 ms\nTenant C: 150 → 3000 ms\nTenant B: 100 → 200 ms\nCác tenant khác bị ảnh hưởng"
a -> pool
b -> pool: Spike
pool -> result
```

**Giải pháp**: Rate limiting, resource quotas, tenant-aware scaling, circuit breaker per tenant (chi tiết ở [Noisy Neighbor Problem](./07-noisy-neighbor.md))

### Thách thức 3: Tenant Customization

Mỗi tenant có nhu cầu khác nhau nhưng phải chạy trên **cùng một codebase**:

| Nhu cầu                       |    Độ khó     | Giải pháp                                    |
| ----------------------------- | :-----------: | -------------------------------------------- |
| Custom branding (logo, color) |     🟢 Dễ     | Tenant config table                          |
| Custom fields trên entities   | 🟡 Trung bình | EAV pattern / JSON columns / Metadata tables |
| Custom business rules         | 🟡 Trung bình | Rule engine, feature flags                   |
| Custom workflows              |    🔴 Khó     | Workflow engine (Temporal, Camunda)          |
| Custom integrations           |    🔴 Khó     | Webhook system, plugin architecture          |
| Custom schema changes         |  🔴 Rất khó   | Metadata-driven schema (Salesforce approach) |

### Thách thức 4: Compliance & Data Residency

```d2 title="Thách thức 4: Compliance & Data Residency"
direction: right
group1: "Regulations" {
  GDPR: "🇪🇺 GDPR\nData phải ở EU"
  HIPAA: "🇺🇸 HIPAA\nHealthcare data encrypted"
  PDPA: "🇹🇭 PDPA\nData ở Thailand"
  LGPD: "🇧🇷 LGPD\nData ở Brazil"
}
group2: "Challenges" {
  C1: "Data residency per tenant"
  C2: "Encryption per tenant"
  C3: "Right to be forgotten"
  C4: "Audit trail per tenant"
  C5: "Data export per tenant"
}
group1.GDPR -> group2.C1
group1.GDPR -> group2.C3
group1.GDPR -> group2.C5
group1.HIPAA -> group2.C2
group1.HIPAA -> group2.C4
group1.PDPA -> group2.C1
group1.LGPD -> group2.C1
```

**Vấn đề cụ thể:**

- Tenant ở EU yêu cầu data phải lưu ở EU region → cần **multi-region deployment**
- Tenant healthcare yêu cầu HIPAA → cần **encryption at rest + audit logging**
- GDPR "right to be forgotten" → phải xóa **toàn bộ** data của tenant mà **không ảnh hưởng** tenant khác
- Trong shared database model, việc đảm bảo compliance **cực kỳ phức tạp**

### Thách thức 5: Operational Complexity

| Vấn đề vận hành    | Trong Single-Tenant     | Trong Multi-Tenant                                                     |
| ------------------ | ----------------------- | ---------------------------------------------------------------------- |
| Schema migration   | Migrate 1 DB            | Migrate 1 DB nhưng ảnh hưởng tất cả tenant / hoặc migrate N schemas    |
| Monitoring         | Monitor 1 instance      | Monitor per-tenant metrics trong shared infra                          |
| Debugging          | Log của 1 customer      | Phải filter log theo tenant_id, distributed tracing cần tenant context |
| Backup/Restore     | Backup 1 DB             | Backup shared DB — restore 1 tenant = phức tạp                         |
| Performance tuning | Optimize cho 1 workload | Optimize cho N workloads khác nhau trên shared resources               |
| Tenant onboarding  | Deploy mới hoàn toàn    | Provision resources, seed data, config — cần automation                |
| Rollback           | Rollback 1 instance     | Rollback ảnh hưởng tất cả tenant — cần canary per tenant               |

---

## Tổng kết — Risk Matrix

```
                      Xác suất xảy ra
                    Thấp        Cao
                 ┌──────────┬──────────┐
          Cao    │ Data     │ Noisy    │
Tác động         │ Residency│ Neighbor │
                 │ Violation│ Problem  │
                 ├──────────┼──────────┤
          Thấp   │ Schema   │ Config   │
                 │ Migration│ Drift    │
                 │ Failure  │          │
                 └──────────┴──────────┘

Ưu tiên xử lý:
1. 🔴 Cross-tenant data leak    → Impact: catastrophic, Must fix
2. 🟠 Noisy neighbor            → Impact: high, Should fix
3. 🟡 Compliance violation      → Impact: high, Must plan
4. 🟢 Operational complexity    → Impact: medium, Optimize over time
```

---

## Đọc thêm

- [Tenant Isolation Models](./02-isolation-models.md) — Silo, Pool, Bridge
- [Data Partitioning Strategies](./03-data-partitioning.md) — DB-per-Tenant, Schema-per-Tenant, RLS
- [Security & Compliance](./09-security-compliance.md) — Phòng chống data leak, GDPR, HIPAA
