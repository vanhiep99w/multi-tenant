---
title: "Compute & Infrastructure Isolation"
description: "Shared vs Dedicated compute, Kubernetes multi-tenancy (Namespace, vCluster, Dedicated Cluster), Serverless multi-tenancy, Network isolation patterns"
---

# Compute & Infrastructure Isolation

Compute isolation quyết định **cách các tenant chia sẻ (hoặc không chia sẻ) tài nguyên xử lý** — CPU, memory, network, storage. Đây là yếu tố ảnh hưởng trực tiếp đến **chi phí, hiệu năng, bảo mật** của hệ thống.

```d2 title="Phổ cách ly compute"
direction: right
n0: "Pool — Shared Everything\nChung pods, DB, cache\nRẻ nhất / Cách ly thấp nhất"
n1: "Bridge — Mixed\nShared compute, DB riêng\nCache theo tenant, rate limits\nCân bằng chi phí và cách ly"
n2: "Silo — Dedicated Everything\nCluster, DB, VPC riêng\nĐắt nhất / Cách ly cao nhất"
n0 -> n1
n1 -> n2
```

> [!NOTE]
> Các nút **Mở ví dụ và các file liên quan** mở Source Explorer để tra cứu code trong bài. Đây là các trích đoạn minh họa, không phải project có thể chạy độc lập; không chứa cấu hình hay secrets production.

## Shared Compute (Pool)

Tất cả tenant chạy trên **cùng compute resources** — cùng pods/containers, cùng process, phân biệt bằng logic (tenant context).

#### Kiến trúc

```d2 title="Shared compute: mọi pod có thể phục vụ mọi tenant"
direction: down
lb: "Load Balancer\nTheo availability, không theo tenant"
cluster: Shared Kubernetes Cluster {
  p1: "Pod 1 · order-svc\nTenants A, B, E"
  p2: "Pod 2 · order-svc\nTenants C, D, F"
  p3: "Pod 3 · user-svc\nTenants A, B, D"
  pn: "Pod N · user-svc\nTenants B, C, D"
}
lb -> cluster.p1
lb -> cluster.p2
lb -> cluster.p3
lb -> cluster.pn
risk: "Tận dụng tài nguyên tối đa\nNoisy Neighbor có thể ảnh hưởng mọi tenant"
cluster -> risk
cluster.icon: ../assets/d2/icons/kubernetes.svg
```

#### Kỹ thuật cải thiện isolation trong Pool

| Kỹ thuật | Mô tả | Hiệu quả |
|---------|--------|:---------:|
| **Request-level rate limiting** | Giới hạn requests/giây per tenant | 🟡 |
| **Connection pooling per tenant** | Mỗi tenant có connection pool riêng (bounded) | 🟡 |
| **Priority queues** | Enterprise requests ưu tiên cao hơn Free | 🟢 |
| **CPU/Memory limits per request** | Timeout + memory cap cho mỗi request | 🟡 |
| **Circuit breaker per tenant** | Tenant lỗi nhiều → circuit break riêng | 🟢 |
| **Bulkhead pattern** | Thread pool riêng cho premium tenant | 🟢 |

#### Khi nào dùng?

```
✅ Shared Compute phù hợp khi:
├── Tenant workload tương đồng (đều nhỏ, ít spike)
├── Số lượng tenant rất lớn (1000+)
├── Budget hạn chế (startup, free tier)
├── Acceptable SLA: 99.5% (không cần 99.99%)
└── Không có compliance yêu cầu compute isolation
```

## Dedicated Compute (Silo)

Mỗi tenant (hoặc nhóm tenant) có **compute resources riêng biệt** — dedicated pods, nodes, hoặc toàn bộ cluster.

#### Kiến trúc

```d2 title="Dedicated compute theo tenant"
direction: right
a: "Tenant A · Enterprise\nNode Pool A · 8 CPU · 32 GB" {
  p1: "Pod A1"
  p2: "Pod A2"
  db: "DB A" {shape: cylinder}
}
b: "Tenant B · Enterprise\nNode Pool B · 16 CPU · 64 GB" {
  p1: "Pod B1"
  p2: "Pod B2"
  db: "DB B" {shape: cylinder}
}
note: "Scaling độc lập; giảm cạnh tranh compute giữa tenant\nChi phí cao khi tài nguyên nhàn rỗi"
```

#### Các mức Dedicated

| Mức | Mô tả | Chi phí | Isolation | Use case |
|-----|--------|:-------:|:---------:|----------|
| **Dedicated Pods** | Tenant-specific pods trên shared nodes | 💰💰 | 🔒🔒 | Mid-tier |
| **Dedicated Node Pool** | Tenant pods chạy trên reserved nodes | 💰💰💰 | 🔒🔒🔒 | Enterprise |
| **Dedicated Cluster** | Tenant có K8s cluster riêng | 💰💰💰💰 | 🔒🔒🔒🔒 | Regulated |
| **Dedicated Account/VPC** | Tenant có cloud account riêng | 💰💰💰💰💰 | 🔒🔒🔒🔒🔒 | Government |

#### Bảng so sánh Pool vs Silo Compute

| Tiêu chí | Shared (Pool) | Dedicated (Silo) |
|----------|:-------------:|:-----------------:|
| **Chi phí per tenant** | 🟢 $1-10/tháng | 🔴 $100-10,000/tháng |
| **Noisy neighbor** | 🔴 Cao | 🟢 Không |
| **Resource utilization** | 🟢 80-95% | 🔴 20-50% |
| **Scaling speed** | 🟢 Nhanh (shared pool) | 🟡 Chậm hơn (provision) |
| **Custom tuning** | 🔴 Không | 🟢 Per tenant |
| **Blast radius** | 🔴 Tất cả tenant | 🟢 1 tenant |
| **Max tenants** | 🟢 10,000+ | 🔴 10-500 |
| **Monitoring** | 🟢 1 cluster | 🔴 N clusters |
| **Compliance** | 🔴 Khó | 🟢 Dễ |

## Kubernetes Multi-Tenancy

Kubernetes cung cấp nhiều cơ chế native cho multi-tenancy. Có **3 mô hình chính**:

#### Tổng quan 3 mô hình K8s Multi-Tenancy

```d2 title="Ba mô hình Kubernetes Multi-Tenancy"
direction: right
namespace: "Namespace per Tenant\nRẻ / Soft isolation" {
  cluster: "Shared Cluster" {
    a: "Namespace A"
    b: "Namespace B"
    c: "Namespace C"
    d: "Namespace D"
  }
}
virtual: "vCluster per Tenant\nChi phí trung bình / Control plane riêng" {
  cluster: "Shared Cluster" {
    a: "vCluster A"
    b: "vCluster B"
  }
}
dedicated: "Cluster per Tenant\nĐắt / Cách ly mạnh" {
  a: "Full Kubernetes Cluster A"
  b: "Full Kubernetes Cluster B"
}
```

#### ① Namespace-per-Tenant

Mỗi tenant có **Kubernetes namespace riêng** với resource quotas, network policies, và RBAC.

**Namespace + ResourceQuota:**

```yaml source="compute-isolation" file="k8s/tenant-namespace.yaml"
# namespace cho tenant
apiVersion: v1
kind: Namespace
metadata:
  name: tenant-acme
  labels:
    tenant: acme
    tier: enterprise
---
# Resource quota — giới hạn tài nguyên per tenant
apiVersion: v1
kind: ResourceQuota
metadata:
  name: tenant-quota
  namespace: tenant-acme
spec:
  hard:
    requests.cpu: "4"           # Max 4 CPU requests
    requests.memory: "8Gi"      # Max 8 GB RAM requests
    limits.cpu: "8"             # Max 8 CPU limits
    limits.memory: "16Gi"       # Max 16 GB RAM limits
    pods: "20"                  # Max 20 pods
    services: "10"              # Max 10 services
    persistentvolumeclaims: "5" # Max 5 PVCs
---
# LimitRange — default limits cho mỗi pod
apiVersion: v1
kind: LimitRange
metadata:
  name: tenant-limits
  namespace: tenant-acme
spec:
  limits:
    - default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "200m"
        memory: "256Mi"
      type: Container
```

**Network Policy — Tenant isolation:**

```yaml source="compute-isolation" file="k8s/network-policy.yaml"
# Deny all traffic giữa các tenant namespaces
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-tenant
  namespace: tenant-acme
spec:
  podSelector: {}  # Áp dụng cho tất cả pods trong namespace
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Chỉ cho phép traffic từ cùng namespace
    - from:
        - namespaceSelector:
            matchLabels:
              tenant: acme
    # Cho phép traffic từ ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              app: ingress-nginx
  egress:
    # Cho phép traffic tới cùng namespace
    - to:
        - namespaceSelector:
            matchLabels:
              tenant: acme
    # Cho phép DNS
    - to:
        - namespaceSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
    # Cho phép shared services (database, cache)
    - to:
        - namespaceSelector:
            matchLabels:
              app: shared-services
```

**RBAC — Per-tenant access:**

```yaml source="compute-isolation" file="k8s/tenant-rbac.yaml"
# Role cho tenant admin
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: tenant-admin
  namespace: tenant-acme
rules:
  - apiGroups: ["", "apps", "batch"]
    resources: ["pods", "deployments", "services", "configmaps", "jobs"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list"]   # Chỉ read secrets, không create
---
# Bind role cho tenant admin user
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: tenant-admin-binding
  namespace: tenant-acme
subjects:
  - kind: User
    name: admin@acme.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: tenant-admin
  apiGroup: rbac.authorization.k8s.io
```

#### ② vCluster — Virtual Clusters

**vCluster** tạo **virtual Kubernetes cluster** bên trong host cluster — mỗi tenant có control plane riêng (virtual API server, virtual scheduler) nhưng chia sẻ worker nodes.

```d2 title="vCluster: control plane riêng, worker nodes dùng chung"
direction: down
host: Host Cluster {
  acme: "vCluster Acme\nAPI Server + etcd riêng\nkubectl, CRDs, namespaces riêng"
  beta: "vCluster Beta\nAPI Server + etcd riêng\nkubectl, CRDs, Helm riêng"
  nodes: Shared Worker Nodes
  acme -> nodes: Sync workloads
  beta -> nodes: Sync workloads
}
```

Các lệnh dưới đây là hướng dẫn thao tác, **không phải transcript đã chạy trên cluster thật**.

```terminal-session
title: Tạo và kết nối vCluster cho Acme
description: Các lệnh minh họa, không được chạy bởi trang tài liệu. Cần cài CLI và kiểm tra quyền/context cluster.
context:
  kind: local
  label: vcluster CLI + kubectl trên máy quản trị
steps:
- id: create
  title: Tạo vCluster trên host cluster
  command: |-
    vcluster create tenant-acme \
      --namespace host-ns-acme \
      --set syncer.extraArgs="{--enforce-node-selector}" \
      --set isolation.enabled=true \
      --set isolation.resourceQuota.enabled=true \
      --set isolation.limitRange.enabled=true \
      --set isolation.networkPolicy.enabled=true
  warning: Kiểm tra kubectl context và phiên bản vcluster trước khi tạo tài nguyên. Các --set phụ thuộc phiên bản chart.
  expected: vCluster tenant-acme được provision trong namespace host-ns-acme.
- id: connect
  title: Chuyển context sang vCluster
  command: vcluster connect tenant-acme --namespace host-ns-acme
  warning: Lệnh có thể đổi kubectl context hiện tại; ghi lại context cũ trước khi kết nối.
  expected: Kết nối vào API server ảo của tenant Acme.
- id: pods
  title: Kiểm tra phạm vi truy cập
  command: kubectl get pods
  context:
    kind: local
    label: kubectl context của vCluster tenant-acme
  expected: Chỉ nhìn thấy pods trong phạm vi vCluster của tenant, không phải toàn bộ host cluster.
```

#### So sánh các mô hình K8s Multi-Tenancy

| Tiêu chí | Namespace | vCluster | Dedicated Cluster |
|----------|:---------:|:--------:|:-----------------:|
| **Isolation** | 🟡 Soft (logical) | 🟢 Strong (virtual) | 🟢 Full (physical) |
| **Chi phí** | 🟢 Thấp nhất | 🟡 Trung bình | 🔴 Cao nhất |
| **Tenant UX** | 🔴 Hạn chế | 🟢 Full kubectl | 🟢 Full cluster |
| **CRDs per tenant** | 🔴 Shared | 🟢 Riêng | 🟢 Riêng |
| **Max tenants** | 🟢 1000+ | 🟡 100-500 | 🔴 10-50 |
| **Noisy neighbor** | 🟡 ResourceQuota | 🟡 + isolation | 🟢 Không |
| **Network isolation** | 🟡 NetworkPolicy | 🟢 + virtual network | 🟢 VPC tách biệt |
| **Ops overhead** | 🟢 Thấp | 🟡 Trung bình | 🔴 Cao |
| **Phù hợp** | Free/Basic tier | Pro/Enterprise | Regulated/Gov |

## Serverless Multi-Tenancy

Serverless (AWS Lambda, Azure Functions, Google Cloud Functions) mang lại **lợi thế tự nhiên** cho multi-tenancy — auto-scaling, pay-per-use — nhưng cũng có **thách thức riêng** về isolation.

#### Serverless Multi-Tenancy Models

```d2 title="Serverless: shared function hay function riêng?"
direction: right
pool: "Shared Function (Pool)" {
  order: "Lambda: order-svc\nMọi tenant · tenant_id từ JWT\nĐơn giản, tiết kiệm\nChung concurrency / cold start contention"
}
silo: "Function per Tenant (Silo)" {
  acme: "Lambda: order-svc-acme\nChỉ tenant acme"
  beta: "Lambda: order-svc-beta\nChỉ tenant beta"
  cost: "Cách ly theo function\nN functions, chi phí quản lý cao"
}
pool.order.icon: ../assets/d2/icons/aws-lambda.svg
silo.acme.icon: ../assets/d2/icons/aws-lambda.svg
silo.beta.icon: ../assets/d2/icons/aws-lambda.svg
```

#### AWS Lambda — Isolation Techniques

**① Shared Function + Reserved Concurrency per Tenant:**

```d2 title="Lambda: giới hạn account, function và tenant"
direction: down
account: "Account limit: 1000 concurrent executions" {
  shared: "order-svc · Shared\nReserved concurrency: 500" {
    free: "Free: 10 concurrent / tenant"
    pro: "Pro: 50 concurrent / tenant"
    ent: "Enterprise: 200 concurrent / tenant"
  }
  dedicated: "order-svc-enterprise-acme\nReserved concurrency: 200\nProvisioned concurrency: 50"
}
```

**② IAM Role per Tenant (Security boundary):**

```python
# Lambda handler — tenant-scoped IAM
import boto3

def handler(event, context):
    tenant_id = event['requestContext']['authorizer']['tenantId']
    tenant_tier = event['requestContext']['authorizer']['tenantTier']

    if tenant_tier == 'enterprise':
        # Enterprise: assume tenant-specific role
        sts = boto3.client('sts')
        credentials = sts.assume_role(
            RoleArn=f'arn:aws:iam::role/tenant-{tenant_id}-role',
            RoleSessionName=f'session-{tenant_id}',
            # Inline policy: restrict to tenant's resources only
            Policy=json.dumps({
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": ["dynamodb:*"],
                    "Resource": f"arn:aws:dynamodb:*:*:table/orders",
                    "Condition": {
                        "ForAllValues:StringEquals": {
                            "dynamodb:LeadingKeys": [tenant_id]
                        }
                    }
                }]
            })
        )['Credentials']

        # Tạo client với tenant-scoped credentials
        dynamodb = boto3.resource('dynamodb',
            aws_access_key_id=credentials['AccessKeyId'],
            aws_secret_access_key=credentials['SecretAccessKey'],
            aws_session_token=credentials['SessionToken']
        )
    else:
        # Free/Pro: shared role + application-level filter
        dynamodb = boto3.resource('dynamodb')

    table = dynamodb.Table('orders')
    response = table.query(
        KeyConditionExpression=Key('tenant_id').eq(tenant_id)
    )
    return {'statusCode': 200, 'body': json.dumps(response['Items'])}
```

#### Serverless Multi-Tenancy — So sánh

| Tiêu chí | Shared Function | Dedicated Function | Hybrid |
|----------|:--------------:|:------------------:|:------:|
| **Isolation** | 🔴 Application-level | 🟢 Function-level | 🟡 Per tier |
| **Chi phí** | 🟢 Lowest | 🔴 Highest | 🟡 Balanced |
| **Cold start** | 🟢 Shared warm pool | 🔴 Per-tenant cold | 🟡 Provisioned for premium |
| **Concurrency** | 🔴 Shared limit | 🟢 Per-function limit | 🟡 Reserved per tier |
| **Deployment** | 🟢 1 function | 🔴 N functions | 🟡 1 + N |
| **Scaling** | 🟢 Auto (pooled) | 🟢 Auto (isolated) | 🟢 Auto |
| **Phù hợp** | Free/Basic | Enterprise | Bridge model |

## Network Isolation

Network isolation đảm bảo **traffic của tenant A không thể reach tài nguyên của tenant B** ở layer network.

#### Các mức Network Isolation

```d2 title="Các mức cách ly network"
direction: right
sg: "① Shared VPC — Security Groups\nCách ly yếu hơn" {
  a: "SG-A: chỉ A → A"
  b: "SG-B: chỉ B → B"
}
vpc: "② VPC riêng — Cách ly mạnh hơn" {
  a: "tenant-acme · 10.1.0.0/16\nPrivate subnet: 10.1.1.0/24"
  b: "tenant-beta · 10.2.0.0/16\nPrivate subnet"
}
private: "③ VPC + PrivateLink" {
  tenant: "Tenant VPC"
  shared: "Shared Service VPC\nKhông Internet / Không peering"
  tenant -> shared: PrivateLink
}
```

#### ① Security Groups (Cùng VPC, phân tách bằng SG rules)

```d2 title="Cùng VPC, phân tách bằng Security Group rules"
direction: down
vpc: "Shared VPC: 10.0.0.0/16" {
  alb: ALB Security Group
  acme: "SG: tenant-acme\nInbound: self + ALB SG"
  beta: "SG: tenant-beta\nInbound: self + ALB SG"
  db: Shared DB Security Group
  nat: NAT Gateway
  alb -> acme
  alb -> beta
  acme -> db
  beta -> db
  acme -> nat
  beta -> nat
}
```

#### ② VPC per Tenant + Shared Services via PrivateLink

```d2 title="② VPC per Tenant + Shared Services via PrivateLink"
direction: down
group1: "Tenant A VPC (10.1.0.0/16)" {
  A_App: "App Pods"
  A_EP: "VPC Endpoint"
}
group2: "Tenant B VPC (10.2.0.0/16)" {
  B_App: "App Pods"
  B_EP: "VPC Endpoint"
}
group3: "Shared Services VPC (10.0.0.0/16)" {
  NLB: "Network Load Balancer"
  DB: "Shared Database" {shape: cylinder}
  Cache: "Shared Cache" {shape: cylinder}
  PLS: "PrivateLink Service"
}
group1.A_EP -> group3.PLS: "PrivateLink"
group2.B_EP -> group3.PLS: "PrivateLink"
group3.PLS -> group3.NLB
group3.NLB -> group3.DB
group3.NLB -> group3.Cache
```

**Terraform — VPC per Tenant:**

```hcl source="compute-isolation" file="terraform/tenant-vpc.tf"
# Module: per-tenant VPC
module "tenant_vpc" {
  source   = "./modules/tenant-vpc"
  for_each = var.enterprise_tenants

  tenant_id       = each.key
  vpc_cidr        = each.value.cidr   # "10.${index}.0.0/16"
  azs             = ["ap-southeast-1a", "ap-southeast-1b"]
  private_subnets = each.value.private_subnets
  public_subnets  = each.value.public_subnets

  # PrivateLink endpoint tới shared services
  shared_service_endpoint = aws_vpc_endpoint_service.shared.id

  tags = {
    Tenant = each.key
    Tier   = each.value.tier
  }
}

# PrivateLink — expose shared services
resource "aws_vpc_endpoint_service" "shared" {
  acceptance_required        = false
  network_load_balancer_arns = [aws_lb.shared_nlb.arn]

  allowed_principals = [
    for tenant in var.enterprise_tenants :
    "arn:aws:iam::root"  # Restrict per tenant account
  ]
}
```

#### Network Isolation Decision Matrix

| Tiêu chí | Security Groups | Subnet Isolation | VPC per Tenant | VPC + PrivateLink |
|----------|:--------------:|:----------------:|:--------------:|:------------------:|
| **Isolation** | 🔴 Weak | 🟡 Medium | 🟢 Strong | 🟢 Strongest |
| **Chi phí** | 🟢 Free | 🟢 Low | 🟡 Medium | 🔴 High |
| **Complexity** | 🟢 Simple | 🟡 Medium | 🔴 Complex | 🔴 Complex |
| **Cross-tenant risk** | 🔴 SG misconfiguration | 🟡 Routing leak | 🟢 No shared network | 🟢 No shared network |
| **Shared services** | 🟢 Same VPC | 🟢 Same VPC | 🟡 VPC Peering/TGW | 🟢 PrivateLink |
| **Max tenants** | 🟢 Unlimited | 🟢 ~200/VPC | 🟡 ~50 VPCs | 🟡 ~50 VPCs |
| **Phù hợp** | Free/Basic | Pro tier | Enterprise | Regulated/Gov |

#### Tổng kết — Compute & Network Isolation Checklist

```
✅ COMPUTE & NETWORK ISOLATION CHECKLIST

Compute:
├── ✅ ResourceQuota / LimitRange per tenant namespace
├── ✅ Pod Security Standards (restricted/baseline/privileged)
├── ✅ Node affinity/taints cho enterprise tenants
├── ✅ Provisioned concurrency cho premium Lambda functions
└── ✅ Bulkhead pattern — thread pool isolation

Network:
├── ✅ NetworkPolicy deny-all + allowlist per namespace
├── ✅ Security Groups per tenant (minimum)
├── ✅ VPC per tenant cho enterprise (PrivateLink to shared)
├── ✅ DNS resolution scoped per tenant
├── ✅ TLS/mTLS giữa tất cả services
└── ✅ Egress filtering — tenant không access internet trực tiếp
```


---

## Đọc thêm

- [Tenant Isolation Models](./02-isolation-models.md) — Silo/Pool/Bridge concept  
- [Noisy Neighbor Problem](./07-noisy-neighbor.md) — Giải quyết vấn đề noisy neighbor trong shared compute
- [Authentication & Authorization](./05-authentication.md) — API Gateway routing per tier
