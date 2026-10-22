# 0005.0002. AWS accounts, network, edge, and compute

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

AFT runs in four AWS accounts: the existing management account for identity, billing, and DNS; staging and production accounts for AFT's own services; and a tenants account for customer code. Each workload account has one small network across two Availability Zones with no NAT gateway, one ECS cluster on Fargate (ARM), one internal load balancer reached only through CloudFront, and data stores with no internet route. Dedicated customer instances are ECS services in the tenants account, created by a workflow from an image and a small manifest, served on a separate domain.

## Decision

Staging, production, and tenants member accounts under the existing Organization; ECS on Fargate ARM64; no NAT gateway; outbound limited to 443; CloudFront with a VPC origin to an internal ALB (fallback named below); dedicated instances in the tenants account from an OCI image plus `aft-instance.json`, provisioned by a DBOS workflow through one scoped cross account role.

## Accounts

| Account | Purpose | Notes |
|---|---|---|
| Management `355103369250` | Organizations, IAM Identity Center (`eu-west-1`), billing, CloudTrail organization trail, `remwa.tech` hosted zone, `Shared` CDK stack | No workloads once `aft-dev` is deleted (AC-3). |
| `aft-staging` | staging workloads and the `dev` database | Feature 10. |
| `aft-production` | production workloads | Path step 11. |
| `aft-tenants` | dedicated instances, the untrusted domain, the `tenants` Aurora cluster | Slice 5, before the first dedicated customer. |

- A service control policy on the three member accounts enforces the Region allowlist (AC-2) and denies leaving the Organization, disabling CloudTrail, GuardDuty, or the KMS keys.
- People use Identity Center permission sets per account. CI uses one GitHub OIDC role per account: `aft-ci-deploy` in the member accounts (CDK deploy roles, ECR push, ECS updates) and `aft-ci-shared` in the management account (only the `Shared` stack) (AC-9).
- The production worker reaches the tenants account only by assuming `aft-tenant-provisioner` there (trust limited to the production worker task role and an external id).

## Network (per workload account)

- VPCs `10.20.0.0/16` (staging), `10.30.0.0/16` (production), `10.40.0.0/16` (tenants); 2 AZs (`eu-west-1a`, `eu-west-1b`); no peering between them.
- **Public subnets**: ECS tasks, with public IPv4 for outbound calls only (ECR, Secrets Manager, providers). Security groups allow inbound only from the ALB security group (or Service Connect peers) and outbound only on 443 to anywhere plus the database and Valkey ports inside the VPC (AC-18).
- **Private subnets**: the internal ALB, reached only by the CloudFront VPC origin.
- **Isolated subnets**: Aurora and Valkey, no route to the internet, except the staging Aurora cluster, which sits in the public subnets so the engineer can reach the `dev` database on it from one IP (child 0003).
- **No NAT gateway**; an S3 gateway endpoint (free); no interface endpoints.
- CDK assertion tests fail on any task security group with inbound from `0.0.0.0/0`, any outbound rule besides 443 and the data ports, or ECS Exec enabled in production or tenants.

## Edge

- Route 53: `remwa.tech` lives in the management account's `Shared` stack (imported with `cdk import` from the zone spec 0003 created); `staging.remwa.tech` is delegated to the staging account; production records are written by the production stack through a narrow cross account role that can change only named records in that zone; the untrusted domain's zone lives in the tenants account.
- One CloudFront distribution per account (staging, production, tenants) with a VPC origin to the internal ALB on `origin.<env domain>`. The origin request policy forwards `Host`, cookies, query strings, and `CloudFront-Viewer-Address`; caching applies only to `/_next/static/*` and public assets. The ALB has an ACM certificate (DNS validated) covering every viewer hostname of its environment, and its security group accepts only the CloudFront VPC origin's managed security group (AC-16).
- CloudFront certificates in `us-east-1`; `www.remwa.tech` is redirected to the apex by a CloudFront Function.
- AWS WAF (AWS managed common rules and a rate rule) on the production and tenants distributions from their first day; app level rate limits remain (X7).
- WebSocket and SSE connections send a heartbeat at least every 20 seconds, and the CloudFront origin response timeout is raised to its maximum (AC-17).
- **Fallback if AC-17 fails at feature 13**: the ALB becomes public in the public subnets, its security group accepts only the AWS managed prefix list `com.amazonaws.global.cloudfront.origin-facing`, and a listener rule rejects requests without the secret `X-Origin-Verify` header that CloudFront adds (value in Secrets Manager, rotated each quarter); AC-16 is reworded accordingly.

## Compute

- One ECS cluster per workload account: `aft-staging`, `aft-production`, `aft-tenants`.
- Each app is one ECS service, Fargate, ARM64, behind ALB host rules (hostnames in the index), sized as in the index table. Service Connect is enabled only once a second internal caller exists, and services that use it get at least 0.5 vCPU and 1 GB for the proxy.
- Autoscaling on CPU at 60 percent, maximum 4 tasks per service, within the connection budget (index shared rules).
- Staging runs 1 task per service; production runs at least 2 tasks across both AZs for user facing services (AC-14). Fargate Spot only for staging services.
- Deployments: rolling with the ECS deployment circuit breaker and rollback; minimum healthy 100 percent and maximum 200 percent for stateless services; ALB deregistration delay 30 seconds; stop timeout 30 seconds; health check `/healthz`.

## Dedicated instances (tenants account)

- A showcase project ships an OCI image (ARM64) and `aft-instance.json`, validated by a zod schema in `packages/contracts`: `name`, `version`, `port`, `healthPath`, `cpu`, `memoryMb`, `env` (names, marking which are secrets), `database` (needs one or not), `oidc` (redirect paths for spec 0004), `mcp` (optional manifest path).
- Images are pulled from the production ECR by the tenants account through a repository policy that allows pull only.
- The provisioning workflow (running in the production worker, assuming `aft-tenant-provisioner`) creates, each as a step with a compensation: the tenant database and user on the `tenants` cluster, secrets `aft/tenants/<slug>/<NAME>` (including a copy of the instance's OIDC client secret), a task role `aft-tenant-<slug>` with the `aft-tenant-boundary` permission boundary (read its own secrets, write its own logs, nothing else), a security group, the ECS service, an ALB host rule, the DNS record `<slug>.<untrusted-domain>`, and the OIDC client (spec 0004 admin API in production). Target: ready in under 2 minutes.
- `aft-tenant-provisioner` may create roles only named `aft-tenant-*` and only with that boundary attached, and may not change the boundary policy or any other role (AC-19).
- Resources are tagged `managed-by=provisioning` and `tenant=<slug>`; a weekly reconciler compares tagged resources with the instance table and reports orphans.
- One ALB listener holds up to 100 rules; a second ALB is added at 90 tenants.

## Consequences

- Costs fit the budgets, and each dedicated instance's cost is attributable to its customer.
- No NAT means outbound calls come from changing public IPs; a provider that needs a fixed source IP would need a NAT then.
- Provisioning through the SDK is fast but not declarative; tags and the reconciler catch drift and orphans.
- The fallback ALB design costs a little more and depends on a shared secret header.

## Rationale (short)

Member accounts are free and give the strongest boundary AWS has: staging cannot touch production, and customer code cannot touch either. Fargate removes cluster operations, and skipping NAT saves about a third of the budget. An internal ALB behind CloudFront keeps the load balancer off the internet, with a named fallback if long lived connections misbehave. Permission boundaries keep the provisioning role from becoming an admin role.
