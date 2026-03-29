---
title: "Best Practices & Anti-Patterns"
description: "Tổng hợp best practices, anti-patterns phổ biến (cross-tenant data leak, noisy neighbor, tenant lock-in) và hướng dẫn tránh sai lầm khi thiết kế multi-tenant"
---

# Best Practices — Tổng hợp

Tổng hợp tất cả best practices từ 13 phần trước — dùng làm **checklist review** khi thiết kế hoặc audit hệ thống multi-tenant.

## Architecture & Design

```
✅ ARCHITECTURE BEST PRACTICES

Tenant Model:
├── ✅ Chọn Pool/Bridge/Silo phù hợp với từng tier
├── ✅ Hỗ trợ migration giữa các model (Pool → Silo)
├── ✅ Tenant ID là UUID, immutable, globally unique
├── ✅ Tenant context propagated qua toàn bộ call chain
└── ✅ Mọi API, DB query, cache key đều PHẢI có tenant_id

Isolation:
├── ✅ Compute: namespace isolation (K8s) cho Enterprise
├── ✅ Network: VPC/subnet isolation cho Silo tenants
├── ✅ Data: RLS + Hibernate Filter (defense-in-depth)
├── ✅ Cache: tenant-prefixed keys, no shared keys
├── ✅ Queue: per-tenant queues hoặc tagged messages
└── ✅ Logs: per-tenant log streams, cannot read others

API Design:
├── ✅ tenant_id from JWT (never from URL/query param)
├── ✅ Rate limiting per tenant (tier-based thresholds)
├── ✅ Quota enforcement at API Gateway level
├── ✅ Versioning: maintain backward compatibility
└── ✅ Error messages: never leak tenant data
```

## Data & Security

```
✅ DATA & SECURITY BEST PRACTICES

Database:
├── ✅ RLS (Row-Level Security) enabled on all tables
├── ✅ tenant_id column: NOT NULL, indexed, in every table
├── ✅ Composite primary key: (tenant_id, entity_id)
├── ✅ Foreign keys: within same tenant only
├── ✅ Connection pooling: per-tenant limits (semaphore)
└── ✅ Schema migration: backward-compatible, parallel

Security:
├── ✅ Zero Trust between tenants
├── ✅ Per-tenant encryption keys (Enterprise: BYOK)
├── ✅ TLS 1.3 everywhere, mTLS internal
├── ✅ Audit logging: structured, immutable, per-tenant
├── ✅ GDPR/HIPAA/SOC2 compliance per tenant
├── ✅ Data residency enforcement (Terraform + routing)
└── ✅ Crypto-erase: delete key = delete all tenant data
```

## Operations & Observability

```
✅ OPERATIONS BEST PRACTICES

Observability:
├── ✅ tenant_id in EVERY log line (MDC injection)
├── ✅ tenant_id as dimension on ALL metrics
├── ✅ tenant_id in EVERY trace span (OpenTelemetry)
├── ✅ Per-tenant dashboards (Platform + Self-service)
├── ✅ Noisy neighbor detection alerts
└── ✅ Cost attribution per tenant

Deployment:
├── ✅ Progressive rollout: internal → beta → pro → all
├── ✅ Feature flags: deploy code first, enable later
├── ✅ Canary deployment: tenant-based traffic routing
├── ✅ 4-level rollback: flag → canary → deploy → DB
├── ✅ Schema migration: validate + backward-compat check
└── ✅ Auto rollback triggers (Prometheus alerts)

Scaling:
├── ✅ HPA: tier-based (shared pool + dedicated silo)
├── ✅ Pod priority: Enterprise > Pro > Free
├── ✅ KEDA: event-driven scaling per tenant
├── ✅ Cache: multi-layer + per-tenant quota
├── ✅ Connection pool: semaphore-limited per tenant
└── ✅ Noisy neighbor throttling before platform scales

Lifecycle:
├── ✅ Automated provisioning pipeline (10 steps)
├── ✅ Tenant config: 3-layer hierarchy
├── ✅ Offboarding: grace period → soft delete → hard delete
├── ✅ Migration: CDC-based, near-zero downtime
└── ✅ Trial → conversion → upsell flow
```

---

# Bad Practices & Anti-Patterns

Các sai lầm phổ biến khi thiết kế multi-tenant — mỗi anti-pattern kèm **hậu quả** và **cách fix**.

## Data Isolation Anti-Patterns

| # | Anti-Pattern | Hậu quả | Fix |
|---|-------------|---------|-----|
| 1 | **tenant_id từ URL/query param** | Tenant A xem data tenant B bằng cách đổi URL | Lấy tenant_id từ JWT claim, server-side validate |
| 2 | **Không có RLS** | Bug trong code → data leak | Enable RLS + Hibernate Filter (defense-in-depth) |
| 3 | **Cache key không có tenant prefix** | `cache:user:123` — tenant A đọc cache tenant B | Key format: `tenant:{tid}:{entity}:{id}` |
| 4 | **Shared ThreadLocal không clear** | Thread pool reuse → tenant context từ request trước | `TenantContextSafetyFilter` + finally block |
| 5 | **Foreign key cross-tenant** | Join data 2 tenants khác nhau | Composite FK: `(tenant_id, entity_id)` |
| 6 | **Log không có tenant_id** | Không biết log nào của tenant nào khi debug | MDC injection, structured JSON logging |

## Architecture Anti-Patterns

| # | Anti-Pattern | Hậu quả | Fix |
|---|-------------|---------|-----|
| 7 | **One-size-fits-all isolation** | Enterprise tenant cùng pool với Free | Tier-based: Pool (Free), Bridge (Pro), Silo (Enterprise) |
| 8 | **No rate limiting per tenant** | 1 tenant DDoS → toàn platform down | Rate limit per tenant tại API Gateway |
| 9 | **Hardcode tenant config** | Mỗi lần thêm tenant phải deploy lại | Config service: DB-based + cache + feature flags |
| 10 | **No tenant context propagation** | Async job chạy không biết tenant nào | Baggage propagation (OpenTelemetry), TenantAwareRunnable |
| 11 | **Deploy tất cả cùng lúc** | Bug ảnh hưởng 100% tenants ngay lập tức | Progressive rollout: canary + feature flags |
| 12 | **Schema migration không backward-compatible** | Old pods crash sau migration | 3-phase migrate: add new → use both → drop old |

## Security Anti-Patterns

| # | Anti-Pattern | Hậu quả | Fix |
|---|-------------|---------|-----|
| 13 | **Shared encryption key cho tất cả** | Compromise 1 key = leak toàn bộ data | Per-tenant KMS key (Enterprise), BYOK option |
| 14 | **Tenant admin có quyền platform admin** | Tenant A xóa data tenant B | Separate IAM roles: tenant-scoped vs platform-scoped |
| 15 | **Audit log chung, không filter** | Tenant A xem audit log tenant B | Per-tenant audit streams, RLS on audit table |
| 16 | **Không validate tenant_id trong JWT** | JWT forgery → access any tenant | Validate `tenant_id` claim server-side, cross-check DB |
| 17 | **Error message leak tenant info** | `"Tenant acme has 500 users"` trong error | Generic error messages, tenant-specific detail only in logs |

## Performance Anti-Patterns

| # | Anti-Pattern | Hậu quả | Fix |
|---|-------------|---------|-----|
| 18 | **Không limit connection pool per tenant** | 1 tenant chiếm hết DB connections | Semaphore per tenant, tier-based limits |
| 19 | **Cache không có per-tenant quota** | 1 tenant flood cache, evict data tenant khác | Per-tenant cache quota (1K/10K/100K keys) |
| 20 | **Metric không có tenant_id dimension** | Không phân biệt traffic/latency per tenant | tenant_id as label on ALL Prometheus metrics |
| 21 | **Scale by total load, ignore tenant distribution** | Enterprise tenant's request served by overloaded pod | Tier-based HPA + dedicated pods for Enterprise |
| 22 | **Synchronous tenant provisioning** | Onboarding timeout → failed registration | Async provisioning pipeline (Step Function / Saga) |

## Tóm tắt — Red Flags Checklist

```
🚨 RED FLAGS — NẾU CÓ BẤT KỲ ITEM NÀO → PHẢI FIX NGAY

❌ tenant_id lấy từ URL hoặc query parameter
❌ SQL queries không có WHERE tenant_id = ?
❌ Cache keys không có tenant prefix
❌ Log lines không có tenant_id
❌ Không có RLS trên database
❌ Shared encryption key cho tất cả tenants
❌ Error messages chứa thông tin tenant khác
❌ ThreadLocal không được clear sau mỗi request
❌ Không có rate limiting per tenant
❌ Deploy new version cho 100% tenants cùng lúc
❌ Schema migration chứa DROP COLUMN/TABLE
❌ Connection pool không limit per tenant
```

---


---

## Đọc thêm

- [Tổng quan Multi-Tenancy](./01-overview.md) — Kiến thức nền tảng
- [Tenant Isolation Models](./02-isolation-models.md) — Chọn model phù hợp
- [Case Study](./15-case-study.md) — Áp dụng best practices vào hệ thống E2E
