# Cryptiva pre-deployment checklist

## Authorization and external infrastructure
- [ ] Confirm explicit authorization to use the cluster and namespace `cryptiva`.
- [ ] Confirm cluster Kubernetes version, resource capacity, and namespace policies.
- [ ] Confirm the NGINX IngressClass and the Cloudflare Tunnel's upstream service, port, and TLS mode.
- [ ] Confirm DNS for `cryptiva.smolelab.com` and that `letsencrypt-prod` exists and can issue for the hostname.
- [ ] Confirm the ingress certificate challenge can reach the ingress according to the ClusterIssuer configuration.

## Image and secrets
- [ ] Replace the `.invalid` Harbor image name and placeholder tag in the production Kustomize overlay with the actual immutable image reference.
- [ ] Confirm the cluster can pull the private Harbor image; create/reference an image-pull Secret through the cluster owner's approved process if needed.
- [ ] Review `.env.k8s-secret` locally and confirm MongoDB and Supabase target the approved production resources. Do not commit or display it.
- [ ] Confirm the Supabase bucket exists and is private.
- [ ] Preserve the correct `MASTER_ENCRYPTION_KEY`; replacing it can make existing encrypted files unreadable.
- [ ] Restrict Secret read access with RBAC and confirm encryption at rest for Kubernetes Secrets.

## Runtime and capacity
- [ ] Confirm MongoDB network access and permissions. The HTTP server does not bind until MongoDB connects.
- [ ] Confirm Supabase and ClamAV definition-update network access.
- [ ] Measure ClamAV initialization/scanning resource use and tune CPU, memory, and ephemeral-storage settings.
- [ ] Confirm `/app/tmp` emptyDir capacity is sufficient for the configured upload batch limits.
- [ ] Check `/health/live` and `/health/ready` after the pod starts.
- [ ] Review pod logs for startup errors without exposing secrets.
- [ ] Test login/logout, upload/download integrity, sharing limits/expiry/revocation, deletion, and upload temp cleanup with approved test data.
- [ ] Confirm MongoDB and encrypted Supabase object backup/recovery procedures.
- [ ] Keep one replica until session, storage, database, and capacity behavior have been validated.

## Validation
- [ ] Render with `kubectl kustomize k8s/overlays/production` and inspect the output.
- [ ] Run `kubectl apply --dry-run=client -k k8s/overlays/production` before any approved deployment.
- [ ] Do not apply the placeholder `02-secret.template.yaml` or commit a generated Secret.
- [ ] After a separately approved deployment, check rollout status and confirm TLS issuance and Cloudflare routing.

This package does not create MongoDB, Supabase, Harbor credentials, a Cloudflare Tunnel, an Ingress controller, cert-manager, DNS records, or TLS infrastructure.
