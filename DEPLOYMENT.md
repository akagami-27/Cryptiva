# Cryptiva deployment guide

## Application and share links

The React workspace is served at `/react`; Express continues to serve the API and the recipient route `/files/shared/:token`. Opening a share requires a signed-in Cryptiva account. The server saves that local share path in the session before redirecting an unauthenticated visitor to `/react/login`, and the existing login handler returns the user to it after successful authentication. The token itself is validated against its stored hash, and the server checks revocation, expiry, ownership, and download limits.

For password-protected shares, the server validates the password and renders an integrity result page. It compares the stored expected SHA-256 with a SHA-256 calculated from the decrypted file bytes. The recipient must then submit the separate Download File form. The download endpoint checks authentication, password-verification session state, current permissions, and integrity again. A share download counts when Node finishes writing the full response; a connection closed before that releases its reservation. MongoDB atomically reserves available slots before sending so concurrent requests cannot exceed the limit while their leases remain valid. Each reservation has a two-minute lease renewed every 40 seconds while the response is active. Expired leases are removed and `activeDownloads` is recomputed on a later attempt. If lease renewal returns false or errors, the server terminates the response and attempts to release the reservation; during a database outage, it cannot guarantee perfect accounting.

The limit counts completed server responses, not proof that the recipient saved the file. There is a crash window: if Node finishes sending the response and crashes before persisting the completion, the reservation eventually expires while `downloadCount` remains unchanged. A later request can then be allowed beyond the configured number of delivered responses. This is the tradeoff of completion-based counting and cannot be resolved from the server after that crash. Share passwords and file paths are not returned to the client.

Deploy the lease-based release to all app replicas together after draining active requests. Older replicas use the previous counter-only reservation logic and must not serve downloads alongside the lease-based release.

File deletion marks metadata as `deleting` before removing the Supabase object, share records, and file metadata in that order. A failure retains a `delete_failed` record with the latest error. Retrying DELETE on that file repeats the idempotent cleanup stages and removes the metadata after success. Upload rollback failures also retain a failed lifecycle record for the same retry path.

Uploads create an `uploading` metadata record before writing the encrypted object, then mark it `active` after storage confirms success. This leaves a recoverable record if the process stops mid-upload. `/files/data` returns only active files and lists unfinished lifecycle records separately under `cleanupRequired`; retry cleanup with DELETE using the returned file ID. Login and share-password attempt limits use a MongoDB-backed store, so counters are shared across sessions and app replicas.

Share URLs are built from `PUBLIC_APP_URL`, which must be the public-facing origin in production. The application does not construct links from Host or forwarded-host headers. Local development can use `http://127.0.0.1:3000`; production requires the exact HTTPS origin, without a path.

Run the unit suite with `npm test`. MongoDB reservation integration tests run when `MONGODB_TEST_URI` is set; they force a uniquely named test database and remove their test collections. Use a dedicated test MongoDB account/cluster for this variable. Without it, the integration tests are reported as skipped.

## Storage, sessions, and secrets

Uploaded encrypted objects are stored in the configured private Supabase Storage bucket, so replicas do not depend on container-local upload storage. MongoDB Atlas is retained for application records and shared Express sessions. Temporary upload and scanning files are stored in the container's temporary directory and are not the durable file store.

Copy `.env.example` to `.env` for local work and supply these values. Never commit `.env` or put secret values in Compose files or Kubernetes manifests.

- `MONGODB_URI`: MongoDB Atlas connection string for the application database.
- `SESSION_SECRET`: random secret of at least 32 characters.
- `MASTER_ENCRYPTION_KEY`: stable base64 encoded 32 byte key; changing it prevents decryption of existing data.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`: Supabase project and private storage bucket settings.
- `PUBLIC_APP_URL`: local `http://127.0.0.1:3000`; production exact HTTPS origin.
- `NODE_ENV`, `PORT`: use `production` and `3000` in the production container.
- `CLAMSCAN_PATH`, `CLAMAV_DATABASE_PATH`: scanner binary and virus definitions location. The supplied Debian image configures these paths.
- `VITE_API_PROXY_TARGET`: optional local Vite proxy target; defaults to `http://127.0.0.1:3000`.

Generate secrets locally and keep the output private:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use the first output for `SESSION_SECRET` and the second for `MASTER_ENCRYPTION_KEY`.

## Run locally

For the Express server plus Vite React development server:

```powershell
Copy-Item .env.example .env
# Edit .env with Atlas, Supabase, encryption, and session values.
npm start
```

In a second terminal:

```powershell
npm --prefix client run dev
```

Open `http://127.0.0.1:5173/react`. The Vite proxy forwards API requests to Express and retains the same-origin session cookie. Set `VITE_API_PROXY_TARGET` if the backend runs elsewhere.

To run the integrated container locally, configure `.env` with valid service credentials and run:

```sh
docker compose up --build
```

Then open `http://127.0.0.1:3000/react`. Compose exposes only the application HTTP port; Atlas and Supabase remain external. The entrypoint initializes ClamAV definitions and fails closed if it cannot initialize them, so the container needs outbound access to the ClamAV mirrors.

## Kubernetes preparation

The supplied manifests include a two replica Deployment, ClusterIP Service, health probes, ConfigMap, and TLS Ingress. The app trusts one ingress proxy hop, uses secure cookies in production, stores sessions in MongoDB, and reads/writes file objects in shared Supabase Storage. No database or storage service is exposed by the manifests.

Before applying them:

1. Build and publish the Docker image, then set the real image reference in `k8s/deployment.yaml`.
2. Set the real public HTTPS host in `k8s/configmap.yaml` and `k8s/ingress.yaml`; set `PUBLIC_APP_URL` to that exact origin.
3. Create the `cryptiva-tls` TLS secret through cert-manager or the cluster's certificate process.
4. Create the `cryptiva-secrets` Kubernetes Secret with `SESSION_SECRET`, `MONGODB_URI`, `MASTER_ENCRYPTION_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Do not commit Secret values. `SUPABASE_BUCKET` is a non-secret ConfigMap setting.
5. Confirm cluster egress to Atlas, Supabase, and ClamAV mirrors, and confirm Atlas permits connections from the cluster.
6. Apply the ConfigMap, Deployment/Service, and Ingress manifests, then check rollout and pod readiness.

Example commands after filling in the cluster-specific values and creating the Secret/TLS Secret:

```sh
docker build -t ghcr.io/YOUR_ORG/cryptiva:YOUR_TAG .
docker push ghcr.io/YOUR_ORG/cryptiva:YOUR_TAG
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml
kubectl rollout status deployment/cryptiva
```

The manifests have not been applied to a Kubernetes cluster as part of this work. A real domain, DNS, ingress controller, TLS provisioning, Atlas network access, Supabase credentials, and image registry access are still required before deployment.

## Manual integration checks

With a local account, an uploaded file, and reachable Atlas/Supabase services, verify login and registration, then create a password-protected share. Open the link signed out and confirm it sends you to React login; after a successful login, confirm it returns to the same link. Confirm a wrong password stays on the password form and a correct password opens the integrity page. Refreshing the integrity page or retrieving the hash must not change the download count. Submit Download File and confirm the file is delivered and the count advances once. Also check invalid, expired, revoked, and exhausted links, and confirm another user's session cannot access private file endpoints.

These checks need real application data and external services. Build and static checks can be run locally, but no successful Docker build or Kubernetes deployment should be inferred without running them in the corresponding environment.
