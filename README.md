# Webco Platform — Infrastructure & Migration Assessment

## What I Built

This repo contains the full infrastructure and migration setup for the Webco real estate platform migrating to Azure. It covers:

- **Task 1**: Pulumi IaC (TypeScript) provisioning Azure Container Apps, PostgreSQL, Key Vault, and Blob Storage
- **Task 2**: Docker Compose for local Directus CMS development + production deployment notes
- **Task 3**: TypeScript migration script moving property listings from Sanity CMS to Directus
- **Task 4**: GitHub Actions CI/CD pipeline + DNS cutover risk analysis

## Assumptions Made

- The platform is Australian-facing, so `australiaeast` (Sydney) is the chosen Azure region for lowest latency
- Directus is used as the headless CMS with PostgreSQL as its data store
- The assessment environment is development/staging — some production-grade settings (geo-redundant backup, high availability) are noted but not enabled to save cost
- Secrets are never hardcoded — all sensitive values use `pulumi.secret()` as placeholders to be injected by a CI/CD pipeline

---

## Design Decisions & Trade-offs

### Why Azure Container Apps over AKS (Kubernetes)?

Container Apps is the right choice for hosting a single CMS service like Directus. It abstracts away cluster management entirely — there are no nodes to patch, no control plane to maintain, and no YAML manifests to manage. Scaling is handled automatically based on HTTP traffic. AKS would be the better choice if the platform grew into many microservices that needed fine-grained networking control, custom ingress controllers, or workloads like GPU-based image processing that require node-level configuration. For a CMS at this scale, AKS adds operational overhead without meaningful benefit.

### Why Managed PostgreSQL over a Self-Hosted Database on a VM?

Azure Database for PostgreSQL Flexible Server handles automated backups (point-in-time recovery up to 35 days), security patching, and optional zone-redundant high availability with automatic failover. Running PostgreSQL on a VM would require a DevOps engineer to manage all of this manually — backup scripts, patch schedules, monitoring, and failover logic. The managed service costs slightly more per compute hour but eliminates an entire category of operational risk, which is worth it for a production platform where data loss is unacceptable.

### How Secrets Are Handled

No real credentials exist anywhere in this codebase. All sensitive values (database passwords, Directus secret keys) are wrapped in `pulumi.secret()`, which marks them as encrypted in Pulumi's state file. In a real deployment, these values would be injected as pipeline variables from a secrets manager (e.g. Azure Key Vault or GitHub Secrets) during the CI/CD run — never hardcoded or committed to source control. The Container App reads secrets at runtime via Key Vault references, so no secret ever lives in plain text in the container configuration.

### Horizontal Scaling Approach

The Container App is configured with a minimum of 1 replica and a maximum of 5, scaling automatically when concurrent HTTP requests exceed 100. For sustained traffic spikes (e.g. a major property listing launch), this can be pre-scaled by temporarily raising `minReplicas`. The stateless nature of the Directus container (media on Blob Storage, sessions in the database) means new replicas can start and serve traffic immediately without any shared local state.

### What I Would Add for a Production SLA

To meet a 99.9% availability SLA I would enable zone-redundant high availability on PostgreSQL (automatic failover under 60 seconds), switch Blob Storage from LRS to GRS (geo-redundant), add an Azure Application Gateway with WAF in front of Container Apps for DDoS protection and TLS termination, configure Azure Monitor alerts for error rate and p95 latency thresholds, and set up a staging environment slot to validate deployments before production traffic is switched over.

---

## If I Had 1 Extra Day

**Infrastructure**: I would add a separate staging environment using Pulumi stacks (`pulumi stack init staging`) so the production and staging environments are identically configured but isolated. I would also add Azure Application Gateway with Web Application Firewall (WAF) in front of the Container App — right now the app is publicly accessible without any layer 7 protection.

**CI/CD Pipeline**: I would add a smoke test step after deployment — a simple curl to the health endpoint that fails the pipeline and triggers automatic rollback if the new container doesn't respond within 30 seconds. I would also separate the pipeline into two workflows: one for pull request validation (lint, type check, test) and one for deployment (only on merge to main).

**Security**: I would configure a private VNet (Virtual Network) so the Container App communicates with PostgreSQL over a private internal network rather than the public internet, even with TLS. This is a standard production security baseline and eliminates an entire network attack surface.