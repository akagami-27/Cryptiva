# Cryptiva Kubernetes deployment

This directory contains a Kustomize base and a production overlay. No command in this guide has been run against a cluster. The image, cluster, Harbor host, and TLS issuer must be verified before deployment.

## Layout

```text
k8s/
  02-secret.template.yaml       # placeholder reference only; never apply
  PREDEPLOY-CHECKLIST.md
  README.md
  base/
    namespace.yaml
    configmap.yaml
    deployment.yaml
    service.yaml
    ingress.yaml
    kustomization.yaml
  overlays/
    production/
      kustomization.yaml
      deployment-patch.yaml
```

The production overlay is authoritative. The previous flat Deployment, ConfigMap, and Ingress files were removed to avoid two conflicting configurations. The numbered resource manifests were moved into `base/` and retained there as their Kustomize equivalents. The placeholder Secret template is not a Kubernetes Secret source and must not be applied.

## Before deployment

1. Confirm authorization to use the cluster and the `cryptiva` namespace. This repository does not connect to a cluster.
2. Confirm the Harbor registry host and project path, then replace the `.invalid` image name and placeholder tag in `overlays/production/kustomization.yaml` with the actual registry and an immutable version or digest. Do not use `latest`.
3. If Harbor is private, create an image-pull Secret using the cluster owner's approved process and add its actual name under `imagePullSecrets` in the Deployment. No registry credentials are stored here.
4. Confirm `cryptiva.smolelab.com` DNS, the existing NGINX IngressClass name, and that the Cloudflare Tunnel routes to the NGINX Ingress Service on the intended origin port.
5. Confirm `letsencrypt-prod` exists as a suitable ClusterIssuer. The Ingress requests a certificate for `cryptiva.smolelab.com` into `cryptiva-tls`; certificate issuance also depends on the issuer's configured challenge reaching this Ingress. If Cloudflare terminates TLS at the edge and uses HTTP to the origin, have the infrastructure owner decide whether this TLS configuration matches that design before applying it. Do not disable origin certificate verification.
6. Confirm the MongoDB URI and Supabase project/bucket are the intended production services, the storage bucket is private, and the service-role key is scoped and protected appropriately. The application starts its HTTP listener only after MongoDB connects. MongoDB unavailability causes startup failure; probes do not make the database optional.
7. Confirm node capacity for the Production overlay's resource requests and limits. The values are initial planning limits, not measured ClamAV memory or throughput results. Adjust them after measuring ClamAV initialization, upload concurrency, and ephemeral storage use.
8. The container entrypoint runs `freshclam` as root, then uses `gosu` to run Node as the image's `node` user. Do not set `runAsNonRoot` or drop all Linux capabilities without changing and testing that startup path. The pod uses RuntimeDefault seccomp, disables privilege escalation, and gives the upload `emptyDir` group ownership for UID/GID 1000. The upload volume is temporary and is not a backup.

## Create the namespace and application Secret

The root `.env` is not used directly by Kubernetes. A local `.env.k8s-secret` contains only these sensitive application keys and is ignored by Git and Docker:

```text
MASTER_ENCRYPTION_KEY
MONGODB_URI
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
JWT_SECRET
```

The local file was selectively prepared from the existing `.env` without printing values. Review its target services locally before using it. It is not added to Git. Never copy the full development `.env` into the Kubernetes Secret. `SUPABASE_BUCKET`, `PUBLIC_APP_URL`, ClamAV paths, and `NODE_ENV` are non-secret configuration in the ConfigMap; `JWT_TTL_SECONDS` is set by the Deployment.

Create or update the namespace:

```sh
kubectl create namespace cryptiva --dry-run=client -o yaml | kubectl apply -f -
```

Create or update the application Secret without writing a Secret manifest:

```sh
kubectl create secret generic cryptiva-secrets --namespace=cryptiva --from-env-file=.env.k8s-secret --dry-run=client -o yaml | kubectl apply -f -
```

Kubernetes Secret values are base64-encoded by default; base64 is not encryption. Restrict Secret access with RBAC and enable the cluster's encryption-at-rest protection for etcd. Avoid commands that print Secret data, and do not commit generated Secret YAML.

To rotate credentials, update only the relevant values in `.env.k8s-secret`, re-run the create/update command above, then restart the Deployment when required:

```sh
kubectl rollout restart deployment/cryptiva --namespace=cryptiva
kubectl rollout status deployment/cryptiva --namespace=cryptiva
```

Rotating `SESSION_SECRET` invalidates session cookies; rotating `JWT_SECRET` invalidates issued JWTs. Do not replace `MASTER_ENCRYPTION_KEY` as an ordinary rotation: existing encrypted data depends on it and needs a separately designed re-encryption/key-migration procedure.

## Validate and inspect locally

These commands render or client-validate manifests; do not apply production resources until the prerequisites above are confirmed.

```sh
kubectl kustomize k8s/overlays/production
kubectl apply --dry-run=client -k k8s/overlays/production
```

Inspect the rendered resources before deployment, checking the image placeholder, namespace, Secret references, resource settings, probes, TLS host, certificate name, and Service selector/ports. Never render the application Secret into a tracked file.

After a separately approved deployment, useful inspection commands are:

```sh
kubectl get deployment,service,ingress,pods --namespace=cryptiva
kubectl rollout status deployment/cryptiva --namespace=cryptiva
kubectl describe ingress cryptiva --namespace=cryptiva
```

## GitHub Actions

No `.github/workflows/` directory or Harbor/Kubernetes workflow exists in this checkout, so this task does not create an automatic deployment trigger. If a release workflow is added later, use repository/environment Variables for `HARBOR_REGISTRY`, `HARBOR_PROJECT`, and `K8S_NAMESPACE=cryptiva`; use Actions Secrets for `HARBOR_USERNAME`, `HARBOR_PASSWORD`, and a narrowly scoped `KUBECONFIG`. Build and deploy the same immutable image tag, use `kubectl apply -k k8s/overlays/production`, and check `kubectl rollout status deployment/cryptiva --namespace=cryptiva`. Never put application or registry credentials in workflow YAML or print them in logs.

## Application behavior and limitations

- One container serves the built React application and Express API on port 3000; the ClusterIP Service exposes port 80 internally.
- `/health/live` reports process liveness and `/health/ready` reports MongoDB readiness. The server binds only after MongoDB connection succeeds.
- The startup probe allows up to 15 minutes for the listener to become available. It cannot keep an entrypoint that is stuck in ClamAV initialization healthy indefinitely; it eventually restarts an unresponsive container.
- `/app/tmp` uses a size-limited `emptyDir` for plaintext upload staging. It is ephemeral and should not be used for persistent or encrypted-file storage.
- Supabase Storage, MongoDB, the Harbor registry, NGINX Ingress, Cloudflare Tunnel, DNS, and cert-manager are external infrastructure. These manifests do not create them.
- No manifests were applied, and no cluster, registry, database, storage service, or certificate issuer was contacted during this work.
