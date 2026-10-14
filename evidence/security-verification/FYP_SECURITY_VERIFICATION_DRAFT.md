# Backend Security Verification â€” FYP Draft

**Project:** Cryptiva Secure File Sharing System
**Draft date:** 15 October 2026
**Baseline:** `aa9cda6` (`test(security): harden cryptography, sharing, auth, and logging`)

This document is a draft section for the FYP report. It is based on source
inspection and the local automated test run recorded in
[`npm-test-output.txt`](npm-test-output.txt). It does not describe a production
deployment or penetration test.

## Methodology and environment

The review followed the four Phase 1 verification batches: cryptography and
DEK wrapping; secure sharing; SHA-256 integrity and ownership; and
authentication, sessions, CSRF, rate limiting, and audit logging. Source code,
deployment manifests, test conventions, and available project documentation
were inspected before testing. The automated suite was executed with
`npm.cmd test` on 15 October 2026. JavaScript syntax checks were run for the
changed startup and crypto files, and `git diff --check` was run.

The tests ran locally under Node.js. Express route tests use mocked MongoDB
models, session objects, or storage clients where described by their test
fixtures. They are useful for route control flow but do not establish real
database or storage behavior. The six tests in
`tests/shareDownloadReservations.mongo.test.js` require `MONGODB_TEST_URI`.
That variable was absent, so those tests were skipped. No MongoDB connection
was attempted. No application server, Docker image, Kubernetes workload, or
live deployment was started or accessed.

## Security controls reviewed and tested

### Cryptography

`services/cryptoService.js` uses AES-256-GCM with 32-byte keys, 12-byte random
IVs, and 16-byte authentication tags. DEKs are wrapped with AES-256-GCM under
the configured master key. The crypto tests exercise round trips, empty and
binary buffers, tampering, wrong keys, malformed input, and fresh IVs through
the production functions. Startup now validates that the configured master
key decodes to 32 bytes before the Express server starts.

### Sharing, integrity, and ownership

The shared-download route checks link state, password-verification state,
ownership, and integrity before delivery. Reservation tests cover lifecycle
settlement, bounded retries, interrupted responses, and counter behavior.
Route-level tests exercise actual Express handlers for shared and ordinary
downloads, invalid integrity metadata, expiry/revocation, and cross-user file
and share operations. Database and storage dependencies in these route tests
are mocks. The six skipped MongoDB tests are the only real-database tests in
this test group and remain unverified.

### Authentication and request protection

The server configures a Mongo-backed session store, a 24-hour cookie lifetime,
`HttpOnly`, `SameSite=Lax`, and `Secure` cookies in production. Production
trusts one proxy hop, and Helmet is enabled. CSRF validation is installed
before application routes. Authentication tests exercise login regeneration
and explicit save, plus logout cookie clearing on successful and failed
session destruction. These use a mocked session implementation, not the real
session store.

Request-error and CSRF logging tests capture emitted output. Shared-link token
segments are redacted, query strings are removed from logged URLs, and the
malformed shared-path regression preserves suffix context without exposing
the raw token. Rate-limit tests exercise the Mongo store interface with a
mocked collection. Audit-log tests exercise selected event fields and
best-effort failure handling with a mocked model.

## Actual test results

The current full-suite run reported:

| Result | Count |
| --- | ---: |
| Passed | 128 |
| Failed | 0 |
| Skipped | 6 |
| Total tests including nested cases | 134 |

All six skipped tests require `MONGODB_TEST_URI`. They cover concurrent
reservation admission at a one-download limit, pruning an expired reservation,
successful settlement, repeated settlement idempotency, share/reservation
ownership isolation, and concurrent settlement. They are not counted as
passing tests.

The focused crypto test file reported 21 passed, 0 failed, 0 skipped. Exact
full-suite output is preserved in `npm-test-output.txt`.

## Deployment review

Repository configuration provides Docker/Compose and Kubernetes deployment
templates. This identifies supported packaging/deployment artifacts; it does
not identify an actual hosting provider or prove that a cluster is deployed.
The Kubernetes image reference and domain are placeholders. The deployment
guide states that manifests have not been applied.

Verified from code and configuration:

- `server.js` requires a session secret of at least 32 characters, validates
  `PUBLIC_APP_URL` as an HTTP(S) origin and requires HTTPS in production, then
  connects to MongoDB before listening.
- MongoDB, Supabase URL/service-role key, and master encryption key are
  required for their respective application functions. The master key is now
  checked during startup; external services were not contacted by this review.
- Session cookies are HTTP-only and same-site; production cookies are secure.
  The server trusts one proxy hop only in production.
- The app uses Helmet, CSRF validation, Mongo-backed rate-limit counters, and
  Supabase Storage for encrypted file objects.
- The Docker image installs ClamAV and runs the application as the `node` user
  after initializing virus definitions. Kubernetes configuration includes
  readiness/liveness probes and TLS ingress templates.

Not verified:

- No live HTTPS, DNS, ingress, TLS certificate, proxy chain, or production
  cookie behavior was tested.
- No Docker build or Kubernetes apply/rollout was performed.
- Atlas network allowlists, Supabase bucket privacy/access policy, actual
  secret provisioning, and ClamAV update availability require deployment
  access and credentials.
- The readiness endpoint checks MongoDB connectivity; it does not perform a
  live Supabase or ClamAV check.

## Limitations and remaining risks

Real MongoDB atomicity, persistence, and concurrency behavior remains
unverified until the six integration tests run against a dedicated test
cluster/account. Those tests create uniquely named databases and drop those
databases during cleanup, so the test account must be explicitly dedicated and
authorized to create and drop them.

Mock-based HTTP tests do not prove actual MongoDB ownership predicates,
session-store invalidation, rate-limit persistence, audit-log persistence, or
Supabase object behavior. A failed server-side logout destroy may leave a
copied session ID usable even though the browser cookie is cleared. The
reservation design also retains a crash/outage window in which a completed
response may remain uncounted after the lease expires. No exactly-once file
delivery guarantee is claimed.

This work is automated security-control verification, not a full penetration
test. No production-grade security claim should be inferred from these results.

## Next steps

1. Provision a dedicated MongoDB test account/cluster and set
   `MONGODB_TEST_URI` only in the test process.
2. Run the six MongoDB integration tests, verify database cleanup, then rerun
   `npm.cmd test` and append the actual results to the report.
3. Configure the real image reference, public HTTPS hostname, TLS secret, and
   external service secrets through the intended deployment platform.
4. Perform manual checks against a non-production deployment and record the
   results separately from local mock-based tests.
