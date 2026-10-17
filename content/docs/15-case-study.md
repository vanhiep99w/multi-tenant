---
title: "Case Study: SaaS Multi-Tenant E2E"
description: "Case study thiết kế hệ thống SaaS Multi-Tenant end-to-end: từ kiến trúc, data model, identity, deployment đến vận hành — áp dụng toàn bộ patterns đã học"
---

# Case Study: Thiết kế SaaS Multi-Tenant E2E

Thiết kế **TaskFlow** — một SaaS Project Management Platform (tương tự Jira/Asana) phục vụ hàng ngàn organization.

> [!NOTE]
> Các nút **Mở ví dụ và các file liên quan** mở Source Explorer để tra cứu code trong bài. Đây là các trích đoạn minh họa, không phải project có thể chạy độc lập; không chứa cấu hình hay secrets production.

## Business Requirements

```
┌──────────────────────────────────────────────────────────────────┐
│  TASKFLOW — SaaS Project Management                              │
│                                                                  │
│  Target: 10,000 tenants, 500K users                              │
│  Tiers:                                                          │
│  ├── Free:       5 users, 3 projects, 1GB storage                │
│  ├── Pro ($29):  50 users, unlimited projects, 50GB              │
│  └── Enterprise: unlimited, custom domain, SSO, SLA 99.95%       │
│                                                                  │
│  Core Features:                                                  │
│  ├── Project boards (Kanban, Scrum)                              │
│  ├── Task management + assignments                               │
│  ├── Real-time collaboration (comments, mentions)                │
│  ├── File attachments                                            │
│  ├── Notifications (email, Slack, webhook)                       │
│  ├── Reporting & analytics per project                           │
│  └── REST API + Webhooks for integrations                        │
│                                                                  │
│  Compliance: GDPR (EU tenants), SOC2 (all)                       │
│  Regions: US (us-east-1), EU (eu-west-1), APAC (ap-southeast-1)  │
└──────────────────────────────────────────────────────────────────┘
```

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tenant model** | Pool (Free/Pro) + Silo (Enterprise) | Cost-efficient for small, isolated for large |
| **DB strategy** | Shared DB + RLS (Pool), Dedicated Aurora (Silo) | Balance isolation vs cost |
| **Identity** | Cognito User Pool per tenant | Managed auth, custom domain support |
| **API Gateway** | AWS API Gateway + Lambda Authorizer | Rate limiting per tenant built-in |
| **Compute** | EKS (shared namespace + dedicated namespace) | K8s native scaling |
| **Cache** | ElastiCache Redis (shared cluster) | Multi-layer: Caffeine + Redis |
| **Messaging** | SQS + SNS | Per-tenant queue for Enterprise |
| **Storage** | S3 (per-tenant prefix, per-tenant bucket Enterprise) | Scalable, lifecycle policies |
| **Observability** | CloudWatch + X-Ray + Grafana | Tenant-aware dashboards |
| **CI/CD** | GitHub Actions + Argo Rollouts + ArgoCD | GitOps, canary deployment |

## System Architecture

Sơ đồ mở ở mức tổng quan để dễ đọc. Chọn **Explore** rồi node **Services — EKS** (hoặc chọn board `topology`) để xem toàn bộ thành phần và kết nối.

```d2 mode=explorer title="System Architecture"
direction: down
clients: "Clients\nWeb / Mobile / SDK / Webhooks"
edge: "Edge\nCloudFront / WAF / Route 53" {
  icon: ../assets/d2/icons/aws-cloudfront.svg
}
api: "API Gateway\nPer-tenant rate limit" {
  icon: ../assets/d2/icons/aws-api-gateway.svg
}
auth: "Lambda Authorizer → Cognito\nJWT → tenant_id" {
  icon: ../assets/d2/icons/aws-cognito.svg
}
services: "Services — EKS\nProject / Task / User / Notify / File / Report" {
  icon: ../assets/d2/icons/aws-eks.svg
  link: layers.topology
  tooltip: "Xem từng service và các kết nối dữ liệu"
}
data: "Data\nAurora Pool + Silo / Redis / S3 / OpenSearch" {
  icon: ../assets/d2/icons/aws-aurora.svg
}
async: "Async\nSQS / SNS" {
  icon: ../assets/d2/icons/aws-sqs.svg
}
clients -> edge -> api
api -> auth
api -> services
services -> data
services -> async
layers: {
  topology: {
    direction: down
    group1: "Client Layer" {
      WEB: "Web App\nReact SPA"
      MOB: "Mobile App\nReact Native"
      API_CLIENT: "API Clients\nSDK / Webhooks"
    }
    group2: "Edge" {
      CF: "CloudFront"
      WAF: "AWS WAF"
      R53: "Route 53\n*.taskflow.app"
    }
    group3: "API Layer" {
      APIGW: "API Gateway\nRate limit per tenant"
      AUTH: "Lambda Authorizer\nJWT → tenant_id"
      COGN: "Cognito\nUser Pool per tenant"
    }
    group4: "Services — EKS" {
      PROJ: "Project Service"
      TASK: "Task Service"
      USER_SVC: "User Service"
      NOTIFY: "Notification Service"
      FILE: "File Service"
      REPORT: "Reporting Service"
    }
    group5: "Data Layer" {
      RDS_POOL: "Aurora PostgreSQL\nShared — Pool tenants"
      RDS_ENT: "Aurora PostgreSQL\nDedicated — Enterprise"
      REDIS: "ElastiCache Redis\nCache + Sessions"
      S3_DATA: "S3\nFile Attachments"
      ES: "OpenSearch\nFull-text Search"
    }
    group6: "Async" {
      SQS: "SQS Queues"
      SNS: "SNS Topics"
    }
    group1.WEB -> group2.CF
    group2.CF -> group2.WAF
    group2.WAF -> group3.APIGW
    group1.MOB -> group3.APIGW
    group1.API_CLIENT -> group3.APIGW
    group3.APIGW -> group3.AUTH
    group3.AUTH -> group3.COGN
    group3.APIGW -> group4.PROJ
    group3.APIGW -> group4.TASK
    group3.APIGW -> group4.USER_SVC
    group4.PROJ -> group5.RDS_POOL
    group4.PROJ -> group5.REDIS
    group4.TASK -> group5.RDS_POOL
    group4.TASK -> group5.REDIS
    group4.TASK -> group5.ES
    group4.TASK -> group6.SQS
    group6.SQS -> group4.NOTIFY
    group4.FILE -> group5.S3_DATA
    group4.REPORT -> group5.RDS_POOL
    group2.CF.icon: ../assets/d2/icons/aws-cloudfront.svg
    group2.WAF.icon: ../assets/d2/icons/aws-waf.svg
    group2.R53.icon: ../assets/d2/icons/aws-route53.svg
    group3.APIGW.icon: ../assets/d2/icons/aws-api-gateway.svg
    group3.AUTH.icon: ../assets/d2/icons/aws-lambda.svg
    group3.COGN.icon: ../assets/d2/icons/aws-cognito.svg
    group5.RDS_POOL.icon: ../assets/d2/icons/aws-aurora.svg
    group5.RDS_ENT.icon: ../assets/d2/icons/aws-aurora.svg
    group5.REDIS.icon: ../assets/d2/icons/aws-elasticache.svg
    group5.S3_DATA.icon: ../assets/d2/icons/aws-s3.svg
    group6.SQS.icon: ../assets/d2/icons/aws-sqs.svg
    group6.SNS.icon: ../assets/d2/icons/aws-sns.svg
  }
}
```

## Database Schema Design

```sql source="case-study" file="sql/taskflow-schema.sql"
-- Shared database schema (Pool tenants — Free/Pro)
-- RLS enabled on ALL tables

CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(256) NOT NULL,
    slug        VARCHAR(100) UNIQUE NOT NULL,
    tier        VARCHAR(20) NOT NULL DEFAULT 'free',
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    region      VARCHAR(50) NOT NULL DEFAULT 'us-east-1',
    custom_domain VARCHAR(256),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id          UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    name        VARCHAR(256) NOT NULL,
    description TEXT,
    board_type  VARCHAR(20) DEFAULT 'kanban',
    status      VARCHAR(20) DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE tasks (
    id          UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    project_id  UUID NOT NULL,
    title       VARCHAR(500) NOT NULL,
    description TEXT,
    status      VARCHAR(20) DEFAULT 'todo',
    priority    VARCHAR(10) DEFAULT 'medium',
    assignee_id UUID,
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects(tenant_id, id)
);

-- RLS Policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Indexes for performance
CREATE INDEX idx_tasks_tenant_project
    ON tasks(tenant_id, project_id, status);
CREATE INDEX idx_tasks_tenant_assignee
    ON tasks(tenant_id, assignee_id, status);
```

## Key Implementation Highlights

#### Request Flow — End to End

```d2 title="TaskFlow: đường đi request từ Edge đến dữ liệu"
direction: down
n0: "① Edge\nCloudFront → WAF\nIP filtering / Rate limit"
n1: "② API Gateway + Lambda Authorizer\nJWT → tenant_id, user_id\nFree: 100 req/s · Pro: 1000 req/s"
n2: "③ TenantContextFilter\nThreadLocal: tenant, user, tier\nMDC + Hibernate tenant filter"
n3: "④ Business Logic\nQuery auto-filter theo tenant\nCache key có tenant prefix"
n4: "⑤ Database / RLS\nSET app.current_tenant\nPolicy tự lọc rows"
n5: "⑥ Response / finally\nClear ThreadLocal + MDC"
n6: "⑦ Observability\nJSON log / Metrics / Trace\nTất cả kèm tenant_id"
n0 -> n1
n1 -> n2
n2 -> n3
n3 -> n4
n4 -> n5
n5 -> n6
n0.icon: ../assets/d2/icons/aws-cloudfront.svg
n1.icon: ../assets/d2/icons/aws-api-gateway.svg
```

## Lessons Learned

| # | Lesson | Impact |
|---|--------|--------|
| 1 | **RLS + Hibernate Filter = bắt buộc** | Tránh 100% data leak bug ở query level |
| 2 | **Rate limiting phải ở API Gateway** | Tránh noisy neighbor kill toàn platform |
| 3 | **Per-tenant cache quota cần sớm** | 1 tenant đã flood Redis trước khi implement |
| 4 | **Feature flags > gradual deploy** | Rollback tính bằng giây thay vì phút |
| 5 | **Cost attribution từ ngày đầu** | Phát hiện 3 tenants lỗ sau 2 tháng |
| 6 | **Async provisioning là bắt buộc** | Sync provisioning timeout khi tạo Aurora |
| 7 | **ThreadLocal clear PHẢI test** | 1 lần quên clear → tenant A thấy data tenant B |
| 8 | **Silo cho Enterprise nên plan sớm** | Migration Pool → Silo mất 2 sprint |

---

# Tài liệu tham khảo

- [AWS SaaS Lens — Multi-Tenant Architecture](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/saas-lens.html)
- [Azure Architecture — Multi-Tenant Solutions](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)
- [Microsoft — Tenancy Models for SaaS](https://learn.microsoft.com/en-us/azure/sql-database/saas-tenancy-app-design-patterns)
- [AWS — SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html)
- [Martin Fowler — Multi-Tenancy](https://martinfowler.com/articles/multi-tenancy.html)

---

> 🔗 **Liên kết**: [Microservice Overview](/basics/01-microservice-overview/) · [Data Management](/data-management/09-data-management/) · [Security](/security/15-security/) · [Design Patterns](/patterns/17-design-patterns/) · [AWS Security](/aws/23-aws-security/)

---

## Đọc thêm

- [Tổng quan Multi-Tenancy](./01-overview.md) — Kiến thức nền tảng
- [Best Practices & Anti-Patterns](./14-best-practices.md) — Tổng hợp rules và patterns
- [Tenant Isolation Models](./02-isolation-models.md) — Decision matrix cho isolation
