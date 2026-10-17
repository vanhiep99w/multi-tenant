---
title: "Authentication & Authorization"
description: "Tenant-aware AuthN/AuthZ, RBAC trong multi-tenant, cross-tenant access control, API Gateway routing — implementation patterns với JWT, Cognito, Kong"
---

# Authentication & Authorization

Trong hệ thống multi-tenant, AuthN (xác thực) và AuthZ (phân quyền) phải trả lời **3 câu hỏi** cùng lúc:

```d2 title="Authentication → tenant → authorization"
direction: right
n0: "① AuthN — Bạn là ai?\nEmail / Password / MFA / SSO"
n1: "② Tenant Resolution — Tenant nào?\nJWT claim / Subdomain / Header"
n2: "③ AuthZ — Được làm gì TRONG tenant?\nRBAC / ABAC scoped theo tenant_id"
n0 -> n1
n1 -> n2
n0.tooltip: "Mở code triển khai trong Source Explorer"
n0.link: "./?source=authentication&file=src/security/TenantAuthFilter.java"
n2.tooltip: "Mở code triển khai trong Source Explorer"
n2.link: "./?source=authentication&file=src/security/TenantAuthorizationService.java"
```

> [!NOTE]
> Các nút **Mở ví dụ và các file liên quan** mở Source Explorer để tra cứu code trong bài. Đây là các trích đoạn minh họa, không phải project có thể chạy độc lập; không chứa cấu hình hay secrets production.

## Tenant-aware AuthN/AuthZ

#### Authentication Flow — Multi-Tenant

```d2 title="Authentication và lựa chọn tenant"
shape: sequence_diagram
user: User
app: Frontend App
idp: "Identity Provider\nCognito / Auth0 / Keycloak"
api: API Gateway
service: Backend Service
user -> app: Login — email + password
app -> idp: POST /oauth/token
idp."Verify credentials → lookup user/tenant → issue JWT"
idp -> app: JWT Token {style.stroke-dash: 4}
app."Claims: sub=user-123 / tenant_id=acme / roles=admin"
app -> api: "GET /api/orders · Authorization: Bearer JWT"
api -> api: Validate signature + expiry
api -> api: Extract tenant_id
api -> service: "Forward + X-Tenant-ID: acme"
service -> service: Set TenantContext = acme
service -> api: Tenant-scoped response {style.stroke-dash: 4}
api -> app: 200 OK {style.stroke-dash: 4}
```

#### JWT Structure cho Multi-Tenant

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-123"
  },
  "payload": {
    "sub": "user-uuid-1234",
    "email": "john@acme.com",
    "name": "John Doe",

    "tenant_id": "acme",
    "tenant_name": "ACME Corp",
    "tenant_tier": "enterprise",

    "org_id": "org-acme-001",
    "roles": ["admin", "billing"],
    "permissions": ["order:read", "order:write", "user:manage"],

    "iss": "https://auth.myapp.com",
    "aud": "https://api.myapp.com",
    "iat": 1700000000,
    "exp": 1700003600,
    "scope": "openid profile email"
  }
}
```

**Các claim quan trọng cho multi-tenant:**

| Claim | Bắt buộc | Mô tả |
|-------|:--------:|-------|
| `sub` | ✅ | User ID duy nhất (UUID) |
| `tenant_id` | ✅ | Tenant hiện tại của user |
| `tenant_tier` | 🟡 | Tier ảnh hưởng rate limit, features |
| `roles` | ✅ | Roles **trong tenant** (admin, member, viewer) |
| `permissions` | 🟡 | Fine-grained permissions |
| `org_id` | 🟡 | Nếu org ≠ tenant (multi-level hierarchy) |

#### Mô hình Identity Provider

**① Shared Identity Provider (1 IDP cho tất cả tenant)**

```d2 title="Shared Identity Provider"
direction: down
idp: "Shared IdP — Cognito / Auth0 / Keycloak" {
  pool: "Single User Pool — mapping qua attributes / app_metadata" {
    john: "john@acme.com → acme"
    jane: "jane@beta.com → beta"
    bob: "bob@acme.com → acme"
  }
}
tradeoff: "Một pool để quản lý\nBug mapping có thể lộ dữ liệu tenant khác\nSSO phải validate tenant"
idp -> tradeoff
```

**② Per-Tenant Identity Provider (1 IDP/pool per tenant)**

```d2 title="Mỗi tenant một User Pool"
direction: right
acme: "Pool: ACME" {
  0: "john@acme"
  1: "bob@acme"
}
beta: "Pool: BETA" {
  0: "jane@beta"
  1: "alice@beta"
}
gamma: "Pool: GAMMA" {
  0: "bob@gamma"
  1: "sue@gamma"
}
tradeoff: "SSO riêng (SAML/OIDC), cách ly theo pool\nĐổi lại: quản lý N pools và user đa tenant phức tạp"
```

**So sánh:**

| Tiêu chí | Shared Pool | Per-Tenant Pool |
|----------|:-----------:|:---------------:|
| **Isolation** | 🟡 Logic | 🟢 Vật lý |
| **Chi phí** | 🟢 Thấp | 🔴 Cao (N pools) |
| **SSO per tenant** | 🟡 Phức tạp | 🟢 Dễ (mỗi pool có SSO riêng) |
| **User multi-tenant** | 🟢 Dễ | 🔴 Phức tạp (user ở nhiều pools) |
| **Quản lý** | 🟢 1 pool | 🔴 N pools |
| **Phù hợp** | Free/Pro tier | Enterprise tier |

#### Tenant-aware Authentication Middleware

```java source="authentication" file="src/security/TenantAuthFilter.java"
@Component
public class TenantAuthFilter extends OncePerRequestFilter {

    private final JwtDecoder jwtDecoder;
    private final TenantRepository tenantRepo;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws Exception {

        String token = extractBearerToken(request);
        if (token == null) {
            response.sendError(401, "Missing authentication token");
            return;
        }

        try {
            // ① Decode + verify JWT
            Jwt jwt = jwtDecoder.decode(token);

            // ② Extract user + tenant info
            String userId = jwt.getSubject();
            String tenantId = jwt.getClaimAsString("tenant_id");
            List<String> roles = jwt.getClaimAsStringList("roles");

            if (tenantId == null) {
                response.sendError(403, "Token missing tenant_id claim");
                return;
            }

            // ③ Verify tenant is active
            Tenant tenant = tenantRepo.findById(tenantId).orElse(null);
            if (tenant == null || !tenant.isActive()) {
                response.sendError(403, "Tenant suspended or not found");
                return;
            }

            // ④ Set security context
            var auth = new TenantAuthentication(userId, tenantId, roles);
            SecurityContextHolder.getContext().setAuthentication(auth);

            // ⑤ Set tenant context
            TenantContextHolder.set(new TenantContext(
                tenantId, tenant.getTier(), tenant.getRegion(), Map.of()
            ));

            chain.doFilter(request, response);

        } catch (JwtException e) {
            response.sendError(401, "Invalid token: " + e.getMessage());
        } finally {
            TenantContextHolder.clear();
            SecurityContextHolder.clearContext();
        }
    }
}
```

#### User thuộc nhiều Tenant

Nhiều SaaS (Slack, Notion) cho phép user thuộc **nhiều tenant**. Điều này cần **tenant selector** flow:

```d2 title="Authentication và lựa chọn tenant"
shape: sequence_diagram
user: User
app: App
idp: Auth Server
api: API
user -> app: Login — email + password
app -> idp: Authenticate
idp -> app: "JWT: sub=user-123, tenants=[acme,beta]" {style.stroke-dash: 4}
app."User thuộc 2 tenants"
app -> app: Hiển thị Tenant Selector
user -> app: Chọn ACME Corp
app -> idp: "POST /token/switch · target_tenant=acme"
idp -> app: "JWT mới: tenant_id=acme" {style.stroke-dash: 4}
app -> api: "GET /api/orders · Bearer JWT tenant=acme"
```

```java
// Tenant switch endpoint
@PostMapping("/auth/switch-tenant")
public TokenResponse switchTenant(
        @RequestBody SwitchTenantRequest request,
        Authentication auth) {

    String userId = auth.getName();
    String targetTenant = request.getTargetTenantId();

    // Verify user có quyền access tenant này
    if (!userTenantRepo.existsByUserIdAndTenantId(userId, targetTenant)) {
        throw new ForbiddenException(
            "User not member of tenant: " + targetTenant);
    }

    // Issue new token với tenant mới
    return tokenService.issueToken(userId, targetTenant);
}
```

## RBAC trong Multi-Tenant

**Role-Based Access Control (RBAC)** trong multi-tenant phải **scope roles theo tenant** — cùng một user có thể là Admin ở tenant A nhưng chỉ là Viewer ở tenant B.

#### Mô hình RBAC Multi-Tenant

```d2 title="RBAC: quyền của user được scope trong từng tenant"
direction: down
platform: "Platform Super Admin\nQuản lý tenant, billing, system config"
a: "Tenant A\nOwner / Admin / Editor / Viewer"
b: "Tenant B\nOwner / Admin / Member / Guest"
c: "Tenant C\nOwner / Admin / Viewer"
john: "John\nAdmin@A, Member@B"
jane: "Jane\nOwner@B, Viewer@C"
platform -> a
platform -> b
platform -> c
john -> a: Admin
john -> b: Member
jane -> b: Owner
jane -> c: Viewer
```

#### Database Schema cho RBAC Multi-Tenant

```sql source="authentication" file="sql/rbac-schema.sql"
-- Bảng tenant
CREATE TABLE tenants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(20) DEFAULT 'free',    -- free, pro, enterprise
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bảng users (global — user có thể thuộc nhiều tenant)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bảng roles (có thể global hoặc per-tenant)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50),             -- NULL = global role, NOT NULL = custom role
    name VARCHAR(100) NOT NULL,        -- "admin", "editor", "viewer"
    description TEXT,
    is_system BOOLEAN DEFAULT false,   -- System roles không được xóa
    UNIQUE(tenant_id, name),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Bảng permissions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(100) NOT NULL,    -- "orders", "users", "billing"
    action VARCHAR(50) NOT NULL,       -- "read", "write", "delete", "manage"
    description TEXT,
    UNIQUE(resource, action)
);

-- Role ↔ Permission mapping
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- User ↔ Tenant ↔ Role mapping (QUAN TRỌNG NHẤT)
CREATE TABLE tenant_memberships (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id),
    status VARCHAR(20) DEFAULT 'active',  -- active, invited, suspended
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

-- Index cho query phổ biến
CREATE INDEX idx_membership_tenant ON tenant_memberships(tenant_id);
CREATE INDEX idx_membership_user ON tenant_memberships(user_id);
```

```d2 title="Quan hệ RBAC Multi-Tenant"
direction: right
user: User
tenant: Tenant
membership: "tenant_memberships\n(user, tenant, role)"
role: Role
role_permission: "role_permissions\n(role, permission)"
permission: "Permission\n(resource, action)"
user -> membership: 1:N
tenant -> membership: 1:N
membership -> role: N:1
role -> role_permission: 1:N
role_permission -> permission: N:1
```

#### Default Roles — Template

```java source="authentication" file="src/security/DefaultRole.java"
// Hệ thống roles mặc định cho mọi tenant
public enum DefaultRole {

    OWNER("owner", "Full access + tenant management", Set.of(
        "orders:*", "users:*", "billing:*", "settings:*", "roles:*"
    )),

    ADMIN("admin", "Full access trừ billing và tenant deletion", Set.of(
        "orders:*", "users:*", "settings:read", "settings:write"
    )),

    EDITOR("editor", "CRUD trên business resources", Set.of(
        "orders:read", "orders:write", "orders:delete",
        "products:read", "products:write"
    )),

    VIEWER("viewer", "Read-only access", Set.of(
        "orders:read", "products:read", "reports:read"
    )),

    GUEST("guest", "Minimal access", Set.of(
        "products:read"
    ));

    // Wildcard permission: "orders:*" = tất cả actions trên orders
}
```

#### Authorization Check — Implementation

```java source="authentication" file="src/security/TenantAuthorizationService.java"
@Component
public class TenantAuthorizationService {

    private final TenantMembershipRepository membershipRepo;
    private final RolePermissionRepository rolePermRepo;

    /**
     * Check: User có permission X trong tenant hiện tại không?
     */
    public boolean hasPermission(String userId, String resource,
                                  String action) {
        String tenantId = TenantContextHolder.getTenantId();

        // ① Lấy role của user trong tenant
        TenantMembership membership = membershipRepo
            .findByUserIdAndTenantId(userId, tenantId)
            .orElseThrow(() -> new ForbiddenException(
                "User not member of tenant: " + tenantId));

        // ② Check membership status
        if (!"active".equals(membership.getStatus())) {
            throw new ForbiddenException("Membership suspended");
        }

        // ③ Check permission through role
        String requiredPerm = resource + ":" + action;
        String wildcardPerm = resource + ":*";

        Set<String> userPerms = rolePermRepo
            .findPermissionsByRoleId(membership.getRoleId());

        return userPerms.contains(requiredPerm)
            || userPerms.contains(wildcardPerm)
            || userPerms.contains("*:*"); // super permission
    }

    /**
     * Check permission — throw nếu không có
     */
    public void requirePermission(String resource, String action) {
        String userId = SecurityContextHolder.getContext()
            .getAuthentication().getName();

        if (!hasPermission(userId, resource, action)) {
            throw new ForbiddenException(String.format(
                "Permission denied: %s:%s in tenant %s",
                resource, action, TenantContextHolder.getTenantId()));
        }
    }
}

// Sử dụng với annotation
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {
    String resource();
    String action();
}

@Aspect
@Component
public class PermissionAspect {

    @Autowired private TenantAuthorizationService authService;

    @Before("@annotation(perm)")
    public void checkPermission(RequirePermission perm) {
        authService.requirePermission(perm.resource(), perm.action());
    }
}

// Controller sử dụng
@RestController
public class OrderController {

    @GetMapping("/api/orders")
    @RequirePermission(resource = "orders", action = "read")
    public List<Order> listOrders() {
        return orderService.findAll(); // Đã scoped theo tenant
    }

    @PostMapping("/api/orders")
    @RequirePermission(resource = "orders", action = "write")
    public Order createOrder(@RequestBody CreateOrderRequest req) {
        return orderService.create(req);
    }

    @DeleteMapping("/api/orders/{id}")
    @RequirePermission(resource = "orders", action = "delete")
    public void deleteOrder(@PathVariable String id) {
        orderService.delete(id);
    }
}
```

## Cross-Tenant Access Control

Mặc định, mọi truy cập **phải bị giới hạn trong tenant hiện tại**. Tuy nhiên, có những use case hợp lệ cần truy cập **cross-tenant**:

#### Khi nào cho phép Cross-Tenant Access?

```
✅ CHO PHÉP (có kiểm soát):
├── Platform Admin: quản lý, support, debugging cho tenant
├── Partner integration: tenant A chia sẻ catalog cho tenant B
├── Marketplace: seller (tenant A) bán hàng cho buyer (tenant B)
├── Parent-child tenant: head office xem data chi nhánh
└── Data export/analytics: aggregated report cross-tenant

❌ KHÔNG BAO GIỜ cho phép:
├── Regular user truy cập data tenant khác
├── API endpoint thiếu tenant validation
├── Background job process data không đúng tenant
└── Cache/queue message không có tenant context
```

#### Cross-Tenant Access Patterns

**① Platform Admin Pattern**

```
┌─────────────────────────────────────────────────────────┐
│  PLATFORM ADMIN ACCESS                                  │
│                                                         │
│  Platform Admin (role: SUPER_ADMIN)                     │
│  ┌─────────────────────────────────────────┐            │
│  │  Can:                                   │            │
│  │  • View any tenant's data (read-only)   │            │
│  │  • Impersonate tenant for debugging     │            │
│  │  • Manage tenant lifecycle              │            │
│  │                                         │            │
│  │  Cannot:                                │            │
│  │  • Modify tenant's business data        │            │
│  │  • Access without audit logging         │            │
│  │  • Bypass without explicit tenant_id    │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
│  ⚠️ Mọi cross-tenant access PHẢI được audit logged      │
└─────────────────────────────────────────────────────────┘
```

```java source="authentication" file="src/security/CrossTenantAccessService.java"
@Component
public class CrossTenantAccessService {

    private final AuditLogService auditLog;

    /**
     * Platform admin impersonate tenant — cho support/debugging
     */
    public <T> T executeAsTenant(String targetTenantId,
                                  String reason,
                                  Supplier<T> action) {
        String adminId = SecurityContextHolder.getContext()
            .getAuthentication().getName();

        // ① Verify caller là platform admin
        if (!isPlatformAdmin(adminId)) {
            throw new ForbiddenException("Only platform admins allowed");
        }

        // ② Audit log TRƯỚC KHI thực hiện
        auditLog.log(AuditEvent.builder()
            .action("CROSS_TENANT_ACCESS")
            .actor(adminId)
            .targetTenant(targetTenantId)
            .reason(reason)
            .timestamp(Instant.now())
            .build());

        // ③ Temporarily switch context
        TenantContext originalCtx = TenantContextHolder.get();
        try {
            TenantContextHolder.set(new TenantContext(
                targetTenantId, "admin-override", null, Map.of()
            ));
            return action.get();
        } finally {
            // ④ Restore original context
            TenantContextHolder.set(originalCtx);
        }
    }
}

// Sử dụng
@GetMapping("/admin/tenants/{tenantId}/orders")
@RequireRole("SUPER_ADMIN")
public List<Order> viewTenantOrders(
        @PathVariable String tenantId,
        @RequestParam String reason) {

    return crossTenantService.executeAsTenant(
        tenantId,
        reason,
        () -> orderService.findAll()
    );
}
```

**② Partner/Marketplace Pattern — Shared Resources**

```d2 title="Cross-Tenant Access Patterns"
direction: right
group1: "Tenant A (Seller)" {
  CatalogA: "Product Catalog"
}
group2: "Shared Layer" {
  SP: "Sharing Policy\ntenant_a shares catalog\nwith tenant_b"
}
group3: "Tenant B (Buyer)" {
  ViewB: "View Shared Catalog"
}
group1.CatalogA -> group2.SP
group2.SP -> group3.ViewB
```

```sql
-- Sharing policy table
CREATE TABLE resource_sharing_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_tenant_id VARCHAR(50) NOT NULL,      -- Tenant sở hữu resource
    target_tenant_id VARCHAR(50) NOT NULL,      -- Tenant được chia sẻ
    resource_type VARCHAR(100) NOT NULL,        -- "product_catalog"
    access_level VARCHAR(20) NOT NULL,          -- "read", "write"
    expires_at TIMESTAMP,                       -- Có thời hạn
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (owner_tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (target_tenant_id) REFERENCES tenants(id)
);

-- Query: Tenant B xem catalog được share từ Tenant A
SELECT p.* FROM products p
JOIN resource_sharing_policies rsp
    ON rsp.owner_tenant_id = p.tenant_id
    AND rsp.resource_type = 'product_catalog'
    AND rsp.target_tenant_id = 'tenant_b'
    AND rsp.access_level IN ('read', 'write')
    AND (rsp.expires_at IS NULL OR rsp.expires_at > NOW());
```

#### Anti-patterns — Cross-Tenant Access

```
❌ ANTI-PATTERN 1: Bypass tenant filter cho "convenience"
   // NEVER DO THIS
   session.disableFilter("tenantFilter");
   List<Order> allOrders = orderRepo.findAll(); // Tất cả tenant!
   ✅ FIX: Luôn dùng explicit cross-tenant service với audit

❌ ANTI-PATTERN 2: Admin endpoint không có audit log
   ✅ FIX: Mọi cross-tenant access phải logged với who, what, when, why

❌ ANTI-PATTERN 3: Sharing bằng cách bỏ tenant_id khỏi query  
   ✅ FIX: Dùng sharing policy table, explicit access grants
```

## API Gateway và Tenant Routing

API Gateway là **điểm vào duy nhất** (single entry point) cho mọi request — nơi thực hiện tenant resolution, authentication, rate limiting, và routing **trước khi** request đến backend services.

#### Kiến trúc tổng quan

```d2 title="Các bước xử lý tại API Gateway"
direction: down
n0: "Request"
n1: "① TLS termination\nGiải mã HTTPS"
n2: "② Authentication\nJWT signature + expiry"
n3: "③ Tenant resolve\nJWT / Subdomain"
n4: "④ Rate limit\nTheo tenant"
n5: "⑤ Route to service\nTheo tier / region / flags"
n0 -> n1
n1 -> n2
n2 -> n3
n3 -> n4
n4 -> n5
headers: "Backend headers\nX-Tenant-ID: acme\nX-Tenant-Tier: enterprise\nX-User-ID: user-uuid-1234\nX-User-Roles: admin,billing\nX-Request-ID: req-uuid-5678\nX-Forwarded-For: 1.2.3.4"
n5 -> headers
```

#### Tenant-aware Routing Patterns

**① Tier-based Routing — Route theo tenant tier:**

```d2 title="Routing và rate limit theo tier"
direction: right
lookup: "Request + tenant_id\nLookup tenant tier"
free: "Free → shared-cluster (pool)\n100 req/phút · 1000 req/ngày"
pro: "Pro → shared-cluster\nPriority queue\n1000 req/phút · 100.000 req/ngày"
ent: "Enterprise → dedicated-cluster\n10.000 req/phút · Không giới hạn/ngày"
lookup -> free
lookup -> pro
lookup -> ent
```

**② Region-based Routing — Data residency compliance:**

```d2 title="Tenant-aware Routing Patterns"
direction: down
GW: "API Gateway - Global"
US: "US Cluster\nus-east-1"
EU: "EU Cluster\neu-west-1"
AP: "APAC Cluster\nap-southeast-1"
US_DB: "US Database" {shape: cylinder}
EU_DB: "EU Database" {shape: cylinder}
AP_DB: "APAC Database" {shape: cylinder}
GW -> US: "tenant: acme, region: us"
GW -> EU: "tenant: euro-corp, region: eu"
GW -> AP: "tenant: asia-inc, region: ap"
US -> US_DB
EU -> EU_DB
AP -> AP_DB
```

#### Implementation — AWS API Gateway + Lambda Authorizer

```javascript source="authentication" file="gateway/authorizer.js"
// Lambda Authorizer — validate JWT + resolve tenant + inject context
exports.handler = async (event) => {
    try {
        const token = event.authorizationToken.replace('Bearer ', '');
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

        const tenantId = decoded.tenant_id;
        const userId = decoded.sub;
        const roles = decoded.roles || [];
        const tenantTier = decoded.tenant_tier || 'free';

        // Verify tenant active (cache this!)
        const tenant = await tenantCache.get(tenantId);
        if (!tenant || tenant.status !== 'active') {
            return generateDeny(userId, event.methodArn);
        }

        // Generate IAM policy with tenant context
        const policy = generateAllow(userId, event.methodArn);

        // Inject tenant info vào context → available in backend
        policy.context = {
            tenantId: tenantId,
            tenantTier: tenantTier,
            userId: userId,
            roles: roles.join(','),
        };

        return policy;
    } catch (err) {
        console.error('Auth failed:', err.message);
        return generateDeny('unknown', event.methodArn);
    }
};

// Backend nhận context từ API Gateway
// event.requestContext.authorizer.tenantId = "acme"
// event.requestContext.authorizer.tenantTier = "enterprise"
```

#### Implementation — Kong Gateway Plugin (Lua)

```lua source="authentication" file="gateway/kong-tenant-plugin/handler.lua"
-- kong-tenant-plugin/handler.lua
local TenantHandler = {
    PRIORITY = 900, -- Chạy sau auth plugin
    VERSION = "1.0",
}

function TenantHandler:access(conf)
    -- Extract tenant từ JWT (đã verify bởi JWT plugin)
    local jwt_claims = kong.ctx.shared.authenticated_jwt_token_claims
    if not jwt_claims then
        return kong.response.exit(401, { message = "Missing JWT" })
    end

    local tenant_id = jwt_claims.tenant_id
    if not tenant_id then
        return kong.response.exit(403, { message = "Missing tenant_id" })
    end

    -- Lookup tenant config (cached)
    local tenant = get_tenant_config(tenant_id)  -- Redis cache
    if not tenant or tenant.status ~= "active" then
        return kong.response.exit(403, { message = "Tenant inactive" })
    end

    -- Rate limiting per tier
    local rate_limit = conf.rate_limits[tenant.tier] or 100
    -- Apply rate limit (delegate to rate-limiting plugin)

    -- Inject headers cho backend
    kong.service.request.set_header("X-Tenant-ID", tenant_id)
    kong.service.request.set_header("X-Tenant-Tier", tenant.tier)
    kong.service.request.set_header("X-User-ID", jwt_claims.sub)
    kong.service.request.set_header("X-User-Roles",
        table.concat(jwt_claims.roles or {}, ","))

    -- Tier-based routing
    if tenant.tier == "enterprise" and tenant.dedicated_upstream then
        kong.service.request.set_scheme("https")
        kong.service.set_target(tenant.dedicated_upstream, 443)
    end
end

return TenantHandler
```

#### Security Best Practices — Gateway Level

```
✅ GATEWAY SECURITY CHECKLIST

Authentication:
├── ✅ JWT validation: signature, expiry, issuer, audience
├── ✅ Token revocation check (blacklist / introspection)
├── ✅ mTLS cho service-to-service (internal traffic)
└── ✅ API key rotation policy

Tenant Isolation:
├── ✅ Strip client-provided X-Tenant-ID header (chống spoofing)
├── ✅ Re-inject tenant from verified JWT claims
├── ✅ Validate tenant active status before routing
└── ✅ Per-tenant rate limiting (không dùng global rate limit)

Request Validation:
├── ✅ Request size limits per tenant tier
├── ✅ Input validation / WAF rules
├── ✅ IP allowlist per enterprise tenant
└── ✅ CORS policy per tenant subdomain

Logging & Monitoring:
├── ✅ Log tenant_id trong mọi access log
├── ✅ Alert khi tenant bất thường (spike traffic)
├── ✅ Track API usage per tenant cho billing
└── ✅ Separate error rates per tenant
```


---

## Đọc thêm

- [Tenant Identity & Context Propagation](./04-tenant-identity.md) — Cách resolve và propagate tenant
- [Security & Compliance](./09-security-compliance.md) — Data leak prevention, encryption
- [Compute & Infrastructure Isolation](./06-compute-isolation.md) — Network isolation
