---
title: "Cloud Deployment Patterns"
description: "Triển khai multi-tenant trên AWS, Azure và GCP — architecture patterns, managed services, landing zone, infrastructure as code"
---

# Triển khai trên Cloud (AWS / Azure / GCP)

Mỗi cloud provider có các managed service riêng hỗ trợ multi-tenancy. Section này tập trung vào **mapping từ pattern → service** và best practice cho từng cloud.

```
┌─────────────────────────────────────────────────────────────────────┐
│              CLOUD PROVIDER COMPARISON                              │
│                                                                     │
│  Pattern          │ AWS              │ Azure           │ GCP        │
│  ─────────────────┼──────────────────┼─────────────────┼────────    │
│  Compute          │ EKS / ECS        │ AKS             │ GKE        │
│  API Gateway      │ API Gateway      │ API Mgmt        │ Apigee     │
│  Database (pool)  │ RDS (shared)     │ Azure SQL       │ Cloud SQL  │
│  Database (silo)  │ RDS (dedicated)  │ SQL Elastic Pool│ AlloyDB    │
│  Cache            │ ElastiCache      │ Azure Cache     │ Memorystore│
│  Queue            │ SQS / SNS        │ Service Bus     │ Pub/Sub    │
│  Identity         │ Cognito          │ Azure AD B2C    │ Identity   │
│  Secrets          │ Secrets Manager  │ Key Vault       │ Secret Mgr │
│  Encryption       │ KMS              │ Key Vault       │ Cloud KMS  │
│  Monitoring       │ CloudWatch       │ Monitor         │ Cloud Mon  │
│  Storage          │ S3               │ Blob Storage    │ GCS        │
│  CDN              │ CloudFront       │ Front Door      │ Cloud CDN  │
│  Service Mesh     │ App Mesh         │ Linkerd on AKS  │ Anthos     │
└─────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> Các nút **Mở ví dụ và các file liên quan** mở Source Explorer để tra cứu code trong bài. Đây là các trích đoạn minh họa, không phải project có thể chạy độc lập; không chứa cấu hình hay secrets production.

## AWS Multi-Tenant Patterns

AWS là cloud phổ biến nhất cho SaaS multi-tenant — có **SaaS Lens** trong Well-Architected Framework.

#### AWS Reference Architecture

Sơ đồ mở ở mức tổng quan để dễ đọc. Chọn **Explore** rồi node **EKS** (hoặc chọn board `topology`) để xem toàn bộ thành phần và kết nối.

```d2 mode=explorer title="AWS Reference Architecture"
direction: down
edge: "Edge\nRoute 53 / CloudFront / WAF" {
  icon: ../assets/d2/icons/aws-cloudfront.svg
}
api: "API Gateway\nLambda Authorizer" {
  icon: ../assets/d2/icons/aws-api-gateway.svg
}
identity: "Cognito\nUser Pool theo tenant" {
  icon: ../assets/d2/icons/aws-cognito.svg
}
compute: "EKS\nShared Pool / Enterprise Silo" {
  icon: ../assets/d2/icons/aws-eks.svg
  link: layers.topology
  tooltip: "Xem topology đầy đủ và các namespace"
}
data: "Data\nAurora / ElastiCache / S3" {
  icon: ../assets/d2/icons/aws-aurora.svg
}
async: "Async\nSQS / SNS / Kinesis" {
  icon: ../assets/d2/icons/aws-sqs.svg
}
observe: "Observability\nCloudWatch / X-Ray / OpenSearch" {
  icon: ../assets/d2/icons/aws-cloudwatch.svg
}
edge -> api
api -> identity
api -> compute
compute -> data
compute -> async
compute -> observe
layers: {
  topology: {
    direction: down
    group1: "Edge Layer" {
      CF: "CloudFront CDN"
      WAF: "AWS WAF"
      R53: "Route 53"
    }
    group2: "API Layer" {
      APIGW: "API Gateway\n+ Lambda Authorizer"
      COGNITO: "Cognito\nUser Pool per tenant"
    }
    group3: "Compute Layer — EKS" {
      NS_SHARED: "Namespace: shared-pool\nFree + Pro tenants"
      NS_ENT1: "Namespace: tenant-acme\nEnterprise"
      NS_ENT2: "Namespace: tenant-beta\nEnterprise"
    }
    group4: "Data Layer" {
      RDS_SHARED: "RDS Aurora\nShared DB — Pool"
      RDS_ENT: "RDS Aurora\nDedicated — Silo"
      REDIS_SHARED: "ElastiCache Redis\nShared Cluster"
      REDIS_ENT: "ElastiCache Redis\nDedicated"
      S3: "S3 Buckets\nper-tenant prefix"
    }
    group5: "Async Layer" {
      SQS: "SQS Queues\nper-tenant or shared"
      SNS: "SNS Topics"
      KINESIS: "Kinesis Data Streams\nAudit Logs"
    }
    group6: "Observability" {
      CW: "CloudWatch\nLogs + Metrics"
      XRAY: "X-Ray Tracing"
      OS: "OpenSearch\nper-tenant index"
    }
    group1.R53 -> group1.CF
    group1.CF -> group1.WAF
    group1.WAF -> group2.APIGW
    group2.APIGW -> group2.COGNITO
    group2.APIGW -> group3.NS_SHARED
    group2.APIGW -> group3.NS_ENT1
    group2.APIGW -> group3.NS_ENT2
    group3.NS_SHARED -> group4.RDS_SHARED
    group3.NS_SHARED -> group4.REDIS_SHARED
    group3.NS_ENT1 -> group4.RDS_ENT
    group3.NS_ENT1 -> group4.REDIS_ENT
    group3.NS_SHARED -> group5.SQS
    group5.SQS -> group5.SNS
    group3.NS_SHARED -> group6.CW
    group1.CF.icon: ../assets/d2/icons/aws-cloudfront.svg
    group1.WAF.icon: ../assets/d2/icons/aws-waf.svg
    group1.R53.icon: ../assets/d2/icons/aws-route53.svg
    group2.APIGW.icon: ../assets/d2/icons/aws-api-gateway.svg
    group2.COGNITO.icon: ../assets/d2/icons/aws-cognito.svg
    group3.NS_SHARED.icon: ../assets/d2/icons/aws-eks.svg
    group3.NS_ENT1.icon: ../assets/d2/icons/aws-eks.svg
    group3.NS_ENT2.icon: ../assets/d2/icons/aws-eks.svg
    group4.RDS_SHARED.icon: ../assets/d2/icons/aws-aurora.svg
    group4.RDS_ENT.icon: ../assets/d2/icons/aws-aurora.svg
    group4.REDIS_SHARED.icon: ../assets/d2/icons/aws-elasticache.svg
    group4.REDIS_ENT.icon: ../assets/d2/icons/aws-elasticache.svg
    group4.S3.icon: ../assets/d2/icons/aws-s3.svg
    group5.SQS.icon: ../assets/d2/icons/aws-sqs.svg
    group5.SNS.icon: ../assets/d2/icons/aws-sns.svg
    group5.KINESIS.icon: ../assets/d2/icons/aws-kinesis.svg
    group6.CW.icon: ../assets/d2/icons/aws-cloudwatch.svg
    group6.XRAY.icon: ../assets/d2/icons/aws-xray.svg
  }
}
```

#### Terraform — AWS Multi-Tenant Infrastructure

```hcl source="cloud-deployment" file="terraform/aws/main.tf"
# modules/tenant/main.tf
# Module tạo infrastructure cho 1 tenant

variable "tenant_id" { type = string }
variable "tier"      { type = string }  # free, pro, enterprise

# ── Cognito User Pool per Tenant ──
resource "aws_cognito_user_pool" "tenant" {
  name = "tenant-${var.tenant_id}"

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
  }

  schema {
    name                = "tenant_id"
    attribute_data_type = "String"
    mutable             = false
    string_attribute_constraints {
      max_length = 50
    }
  }

  tags = local.tags
}

# ── Database — conditional on tier ──
resource "aws_rds_cluster" "tenant_db" {
  count = var.tier == "enterprise" ? 1 : 0

  cluster_identifier = "db-${var.tenant_id}"
  engine             = "aurora-postgresql"
  engine_version     = "15.4"
  master_username    = "admin"
  master_password    = random_password.db.result

  db_subnet_group_name   = var.db_subnet_group
  vpc_security_group_ids = [var.db_security_group]

  deletion_protection = true
  storage_encrypted   = true
  kms_key_id          = aws_kms_key.tenant.arn

  tags = local.tags
}

# ── KMS Key per Tenant (Enterprise) ──
resource "aws_kms_key" "tenant" {
  count = var.tier == "enterprise" ? 1 : 0

  description = "CMK for tenant ${var.tenant_id}"
  key_usage   = "ENCRYPT_DECRYPT"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowTenantAdmin"
        Effect = "Allow"
        Principal = { AWS = var.tenant_admin_role_arn }
        Action    = ["kms:Encrypt", "kms:Decrypt",
                     "kms:GenerateDataKey"]
        Resource  = "*"
      }
    ]
  })

  tags = local.tags
}

# ── S3 Bucket — per tenant prefix or dedicated ──
resource "aws_s3_bucket" "tenant" {
  count  = var.tier == "enterprise" ? 1 : 0
  bucket = "saas-${var.tenant_id}-data"

  tags = local.tags
}

# ── EKS Namespace (Enterprise) ──
resource "kubernetes_namespace" "tenant" {
  count = var.tier == "enterprise" ? 1 : 0

  metadata {
    name = "tenant-${var.tenant_id}"
    labels = {
      tenant_id = var.tenant_id
      tier      = var.tier
    }
  }
}

# ── Resource Quota per namespace ──
resource "kubernetes_resource_quota" "tenant" {
  count = var.tier == "enterprise" ? 1 : 0

  metadata {
    name      = "tenant-quota"
    namespace = kubernetes_namespace.tenant[0].metadata[0].name
  }

  spec {
    hard = {
      "requests.cpu"    = "4"
      "requests.memory" = "8Gi"
      "limits.cpu"      = "8"
      "limits.memory"   = "16Gi"
      "pods"            = "50"
    }
  }
}

locals {
  tags = {
    tenant_id   = var.tenant_id
    tier        = var.tier
    managed_by  = "terraform"
    environment = var.environment
  }
}
```

#### AWS SaaS Lens — Key Recommendations

| Pillar | Recommendation | Implementation |
|--------|---------------|----------------|
| **Security** | Tenant isolation at every layer | RLS + IAM policies + VPC |
| **Reliability** | Blast radius containment | Silo for Enterprise, throttling for Pool |
| **Performance** | Noisy neighbor protection | Per-tenant quotas + rate limiting |
| **Cost** | Cost attribution per tenant | AWS Cost Allocation Tags |
| **Operations** | Tenant-aware observability | CloudWatch dimensions + X-Ray |

## Azure Multi-Tenant Patterns

Azure có hỗ trợ multi-tenancy tốt qua **Azure AD B2C** và **Elastic Pools**.

#### Azure Reference Architecture

```d2 title="Kiến trúc Multi-Tenant trên Azure"
direction: down
edge: Front Door — CDN / WAF / Global LB
api: "Azure API Management\nRate limit theo subscription key\nValidate JWT → tenant_id\nRouting theo tenant"
aks: AKS {
  shared: Namespace shared-pool
  acme: Namespace tenant-acme
  identity: Pod Identity / Managed Identity
}
sql: "Azure SQL\nElastic Pool + Dedicated DB cho Enterprise" {shape: cylinder}
redis: "Azure Cache for Redis\nShared / Silo"
blob: "Blob Storage\nContainer theo tenant"
support: "Azure AD B2C · Key Vault\nAzure Monitor + App Insights\nService Bus queues theo tenant"
edge -> api -> aks
aks -> sql
aks -> redis
aks -> blob
edge.icon: ../assets/d2/icons/azure-front-door.svg
api.icon: ../assets/d2/icons/azure-api-management.svg
sql.icon: ../assets/d2/icons/azure-sql.svg
blob.icon: ../assets/d2/icons/azure-storage.svg
aks.icon: ../assets/d2/icons/azure-aks.svg
```

#### Azure SQL Elastic Pool — Cost-Efficient Multi-Tenancy

```jsonc source="cloud-deployment" file="azure/elastic-pool.jsonc"
// Azure Resource Manager (ARM) template snippet
{
  "type": "Microsoft.Sql/servers/elasticPools",
  "name": "[concat(variables('sqlServerName'), '/tenant-pool')]",
  "properties": {
    "edition": "Standard",
    "dtu": 400,
    "databaseDtuMin": 0,
    "databaseDtuMax": 100,
    "storageMB": 512000
  }
}

// Per-tenant database IN the elastic pool
{
  "type": "Microsoft.Sql/servers/databases",
  "name": "[concat(variables('sqlServerName'), '/', parameters('tenantId'))]",
  "properties": {
    "elasticPoolId": "[resourceId('Microsoft.Sql/servers/elasticPools', variables('sqlServerName'), 'tenant-pool')]",
    "collation": "SQL_Latin1_General_CP1_CI_AS"
  }
}
```

> **Elastic Pool** = mỗi tenant có riêng database nhưng **chia sẻ DTU resources** trong pool → cost-efficient hơn dedicated DB cho mỗi tenant.

#### Azure vs AWS Key Differences

| Aspect | AWS | Azure |
|--------|-----|-------|
| **DB Multi-tenant** | RDS + RLS / Schema-per-tenant | SQL Elastic Pool (DB-per-tenant, shared resources) |
| **Identity** | Cognito User Pool | Azure AD B2C (more enterprise-ready) |
| **API Gateway** | API Gateway + Lambda Auth | API Management (built-in subscription keys) |
| **Encryption** | KMS (per-tenant CMK) | Key Vault (per-tenant vault or key) |
| **Isolation** | IAM policies + VPC | RBAC + Azure Policy + VNet |

## GCP Multi-Tenant Patterns

GCP mạnh về **data analytics** và **Kubernetes (GKE)** — phù hợp cho data-intensive multi-tenant.

#### GCP Reference Architecture

```d2 title="Kiến trúc Multi-Tenant trên GCP"
direction: down
edge: Cloud CDN + Cloud Armor
api: "Apigee\nDeveloper portal / API key / OAuth / Analytics theo tenant"
gke: "GKE\nNamespace Enterprise theo tenant\nWorkload Identity → IAM\nConfig Connector"
db: "Cloud SQL / AlloyDB / Spanner\nShared hoặc Silo" {shape: cylinder}
cache: Memorystore Redis
storage: Cloud Storage — bucket / prefix theo tenant
analytics: BigQuery — dataset theo tenant
queue: Pub/Sub — topic theo tenant / subscription theo service
support: Identity Platform / Secret Manager / Cloud Monitoring + Trace
edge -> api -> gke
gke -> db
gke -> cache
gke -> storage
gke -> analytics
gke -> queue
edge.icon: ../assets/d2/icons/gcp-cdn.svg
api.icon: ../assets/d2/icons/gcp-apigee.svg
db.icon: ../assets/d2/icons/gcp-sql.svg
cache.icon: ../assets/d2/icons/gcp-memorystore.svg
storage.icon: ../assets/d2/icons/gcp-storage.svg
analytics.icon: ../assets/d2/icons/gcp-bigquery.svg
queue.icon: ../assets/d2/icons/gcp-pubsub.svg
gke.icon: ../assets/d2/icons/kubernetes.svg
```

#### GCP — Cloud Spanner for Global Multi-Tenant

```sql source="cloud-deployment" file="gcp/spanner-schema.sql"
-- Spanner: globally distributed with tenant-level isolation
-- Interleaved tables for co-located tenant data

CREATE TABLE Tenants (
  tenant_id   STRING(36) NOT NULL,
  name        STRING(256),
  tier        STRING(20),
  region      STRING(50),
  created_at  TIMESTAMP NOT NULL
    OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY (tenant_id);

-- Orders interleaved with Tenants → co-located on same node
CREATE TABLE Orders (
  tenant_id   STRING(36) NOT NULL,
  order_id    STRING(36) NOT NULL,
  amount      FLOAT64,
  status      STRING(20),
  created_at  TIMESTAMP NOT NULL
    OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY (tenant_id, order_id),
  INTERLEAVE IN PARENT Tenants ON DELETE CASCADE;

-- Row-level access via Spanner Fine-Grained Access Control
GRANT SELECT ON TABLE Orders
  TO ROLE tenant_reader
  WHERE tenant_id = @current_tenant;
```

> **Spanner Interleaving** = data cùng tenant nằm trên cùng node → queries nhanh, no cross-node joins.

#### Cloud Provider Selection Guide

| Criteria | Best Choice | Why |
|----------|------------|-----|
| **Most SaaS features** | AWS | SaaS Lens, Cognito, extensive docs |
| **Enterprise identity** | Azure | Azure AD B2C, Entra ID integration |
| **Global database** | GCP | Spanner (global consistency) |
| **Cost-efficient DB** | Azure | Elastic Pools (shared DTU) |
| **Kubernetes native** | GCP | GKE Autopilot, Config Connector |
| **Analytics per tenant** | GCP | BigQuery dataset per tenant |
| **Compliance (gov)** | AWS | GovCloud, most certifications |
| **Hybrid cloud** | Azure | Arc, on-prem AD integration |

---

---

## Đọc thêm

- [CI/CD & Deployment](./12-cicd-deployment.md) — Pipeline, canary deployment
- [Compute & Infrastructure Isolation](./06-compute-isolation.md) — Kubernetes, serverless isolation
- [Security & Compliance](./09-security-compliance.md) — Cloud-specific compliance
