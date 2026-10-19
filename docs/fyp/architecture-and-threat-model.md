# Cryptiva Architecture and STRIDE Threat Model

## 1. Purpose and evidence boundary

This document describes the Cryptiva Secure File Sharing System from the repository implementation and deployment configuration reviewed on 19 October 2026. It is intended to support the project report; it is not a certification, penetration-test result, or claim that production infrastructure was independently inspected.

The system and deployment figures are maintained as Mermaid source in [system-architecture.mmd](../architecture/system-architecture.mmd) and [deployment-architecture.mmd](../architecture/deployment-architecture.mmd). The checked-out project contains React/Vite client code, an Express backend, MongoDB models and sessions, Supabase Storage integration, encryption and file-scanning services, Docker files, GitHub Actions configuration, and Kubernetes manifests.

**Startup verification caveat:** the `registerReactPages` import and route registration are present in the reviewed `server.js`. The GitHub Actions workflow runs tests and builds the frontend but does not run a pre-publication server-start smoke test. The full backend startup, external-service connections, and production behavior have not been verified in this review.

## 2. Architecture overview

The React application is built by Vite and served from `client/dist` by Express in production. During local development, Vite runs at `127.0.0.1:5173`; its proxy target is configured as `http://127.0.0.1:3100`. The backend proxy paths include API and authentication endpoints. That local setting is not a production deployment setting.

Express provides authentication, dashboard, activity, search, analytics, file, share, security, and profile routes. It connects to MongoDB through Mongoose. The session store is Mongo-backed; the session supports CSRF state and temporary share-flow state, while authenticated identity is derived from a signed JWT and checked against the account record and token version. Session and authentication cookies are configured HttpOnly and SameSite=Lax, with Secure enabled in production.

### 2.1 File upload and storage

An authenticated browser submits a multipart upload through Express. Multer stages the incoming file under `tmp`. The route enforces up to 20 files per request and 50 MiB per file; validation rejects unsupported extensions, unsafe filenames, size violations, and incompatible signatures. ClamAV scans the staged plaintext before encryption. The scanner uses bounded concurrency/queue and timeouts; a scanner error prevents the upload from proceeding.

After a clean scan, the backend computes SHA-256 over the plaintext, creates a random per-file data-encryption key, encrypts file bytes with AES-256-GCM, and wraps the data key using the configured master key. Supabase Storage receives the ciphertext. MongoDB stores file ownership and metadata, storage path, encryption parameters, wrapped key, and SHA-256 value. Therefore, file bytes and file metadata have different storage locations and confidentiality properties. The original filename and other metadata are not encrypted by the file-content encryption service.

### 2.2 Download and sharing

Owner downloads require authenticated identity and an owner-constrained file lookup. The backend downloads ciphertext, unwraps the data key, decrypts using AES-GCM, recalculates SHA-256, and blocks delivery if integrity metadata is missing or mismatched. Only then does it return plaintext.

For a share, the backend creates a random token, stores a token hash for lookup and an encrypted form for recovery, hashes an optional password with bcrypt, and records expiry/download-limit settings. Share access checks authentication, revocation, expiry, password verification state, and file ownership. The password verification state is bound to the share and expires. A download slot is reserved atomically and counted only after a completed response; expiring leases support recovery from interrupted workers.

### 2.3 Identity, CSRF, and audit logging

The backend validates signed JWTs and checks that the account is active and its token version is current. The Mongo session is retained for CSRF and temporary share state. Unsafe methods require a CSRF value from the current session; comparison is constant-time. The React dashboard uses the shared `ensureCsrfToken` helper for state-changing fetch calls and file uploads.

The audit service records events for authentication, file actions, share actions, and related security/profile operations in MongoDB. Some successful request paths treat audit persistence as best effort. The repository does not show an immutable external audit archive or a deployed retention/alerting policy.

## 3. Deployment pipeline

The GitHub Actions workflow runs validation on pull requests and pushes targeting `main`: Node.js 22 setup, root and frontend `npm ci`, `npm test`, and the Vite production build. A push to `main`, after validation, builds a multi-stage Docker image and pushes it to Harbor using a commit SHA tag and a `latest` tag for `main`. The workflow uses GitHub environment secrets/variables for registry and Kubernetes access; no credential values are included in this report.

The deploy job updates the production Kustomize image reference, applies the production overlay, waits for the Kubernetes rollout, then checks the declared live and ready health URLs. Kubernetes manifests declare a Deployment, ClusterIP Service, Ingress with TLS settings, probes, resource limits, a temporary upload volume, and references to Kubernetes Secrets and ConfigMaps. These manifests show intended configuration only; cluster state, issuer, registry, DNS, MongoDB, and Supabase configuration were not inspected.

The workflow configuration was inspected in the repository. It does **not** configure SAST, dependency-audit, container-image scanning, or a pre-publication server-start smoke test; its actions are referenced by version tags rather than immutable commit SHAs. The project owner has reported a successful workflow run, but this review did not inspect its run ID or logs. That report is distinct from the configuration evidence and does not independently establish the deployed revision or current production behavior.

## 4. STRIDE methodology and assessment

Threats were identified against the system's assets and trust boundaries using the STRIDE categories: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege. Likelihood and impact are scored qualitatively from 1 to 5. The product L × I is grouped as 1–4 Low, 5–9 Moderate, 10–16 High, and 17–25 Critical. These scores are prioritization judgments, not measured probabilities.

The full threat register, evidence, current controls, residual risk, mitigation, and validation plan are in [stride-threat-model.md](../security/stride-threat-model.md). Key review priorities include upload resource exhaustion under concurrent large requests; operational protection and rotation of MongoDB/Supabase/master-key credentials; the absence of CI security scanning and a pre-publication server-start smoke test; and incomplete Kubernetes least-privilege controls. These are risks or verification gaps, not claims of a confirmed production compromise.

## 5. Security control and test evidence

The traceability matrix is in [security-control-traceability.md](../security/security-control-traceability.md). Relevant implementation and tests include:

- JWT validation and account-version checks: `services/jwtService.js`, `middleware/auth.js`, `tests/jwtService.test.js`, `tests/auth.test.js`.
- CSRF generation/validation and React integration: `middleware/csrf.js`, `server.js`, `client/src/api/client.js`, `client/src/pages/Dashboard.jsx`, `tests/csrfSession.test.js`.
- Ownership, shared download, expiry, password, and download-limit checks: `routes/files.js`, `services/shareDownloadReservations.js`, `tests/sharedDownloadRoute.test.js`, `tests/shareDownloadReservations.test.js`.
- Encryption and file-integrity functions: `services/cryptoService.js`, `models/file.js`, `tests/cryptoService.test.js`.
- File type validation, temporary upload cleanup, and malware scanning: `services/fileValidationService.js`, `services/malwareScanService.js`, `tests/fileValidationService.test.js`, `tests/fileUploadCleanup.test.js`, `tests/malwareScanService.test.js`.
- CI pipeline: `.github/workflows/deployment.yml`; Docker and cluster declarations: `Dockerfile`, `docker-entrypoint.sh`, `k8s/base/`, `k8s/overlays/production/`.

The latest recorded local full test run completed **203 passed, 6 skipped, 0 failed**. The skipped tests are MongoDB integration tests that require a dedicated test URI. Unit and mocked route tests do not prove cloud policy, actual browser upload behavior, production service connectivity, or full backend startup. The workflow's test/build commands are present, but there is no server-start smoke test or security-scan job.

## 6. Limitations and recommended improvements

1. Add a pre-publication server-start smoke test using isolated test configuration. Verify that the application entry point loads and that a basic health route responds without relying on production credentials; the current source's React page import and registration are present, but the workflow does not test startup.
2. Set aggregate upload and concurrency limits consistent with the 2 GiB temporary volume; test scanner queue saturation and interrupted uploads.
3. Verify MongoDB and Supabase least privilege, transport security, backup access, retention, and master-key lifecycle with the infrastructure owner.
4. Add dependency, SAST, and container image scanning gates; pin third-party GitHub Actions to immutable SHAs and verify workflow/environment protection.
5. Strengthen Kubernetes runtime restrictions where compatible: non-root execution, read-only root filesystem, dropped capabilities, and network policy. Verify the effective UID and ClamAV startup behavior in the deployed image.
6. Define durable, tamper-evident audit retention and alerting; test behavior when audit persistence is unavailable.
7. Execute the dedicated Mongo integration suite on an isolated disposable database, then perform a safe browser upload/download test against isolated development services.
8. Record the deployed image digest/commit and the successful Actions run ID so FYP claims can be tied to a specific revision.

## 7. Figure and table captions

- **Figure 1.** Cryptiva application architecture and principal data flows. The diagram distinguishes plaintext staging, encrypted object storage, MongoDB metadata, and the configured local Vite proxy. Kubernetes and external-service runtime state remain unverified.
- **Figure 2.** GitHub Actions build and deployment pipeline declared in the repository. Validation gates image publication; the workflow then updates the image reference, applies Kubernetes manifests, and performs rollout/health checks.
- **Table 1.** STRIDE threat register and qualitative risk assessment for Cryptiva, including existing controls, evidence, residual risk, and recommended validation.
- **Table 2.** Traceability from security objectives to implementation evidence, automated tests, results, and remaining limitations.

## 8. Academic references

No external claims or bibliographic references have been fabricated. For the final FYP submission, cite an authoritative source for the STRIDE method and appropriate primary/official guidance for secure session/CSRF design, cryptographic key management, software supply-chain security, and Kubernetes hardening. Use the institution's required citation format and verify each source directly.
