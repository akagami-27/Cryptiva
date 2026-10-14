# Cryptiva security verification evidence

This folder contains evidence collected locally on 2026-10-15. It is not a
record of a live deployment or a real MongoDB integration run.

## Artifacts

| Artifact | How it was produced | What it supports | Limitations |
| --- | --- | --- | --- |
| `npm-test-output.txt` | Captured output of `npm.cmd test` after startup master-key validation was added. | Current automated suite: 128 passed, 0 failed, 6 skipped. | The six MongoDB reservation integration tests were skipped because `MONGODB_TEST_URI` was absent. Mocked tests do not establish MongoDB persistence or atomicity. |
| `FYP_SECURITY_VERIFICATION_DRAFT.md` | Prepared from repository inspection, test output, and deployment manifests. | Draft methodology, verified controls, results, deployment observations, and limitations for the FYP report. | This is a draft artifact; no formal report source was present in the repository. |

## Reproduction

From the repository root, run:

```powershell
npm.cmd test
```

To run the six MongoDB tests, configure `MONGODB_TEST_URI` in the test process
to a dedicated test cluster/account first. The tests select uniquely named
databases and call `dropDatabase()` for those databases during cleanup. Do not
use an application or production connection string.

No screenshot was produced: the application was not started because this
environment does not have a verified dedicated test database and a live
application run also depends on external MongoDB, Supabase, and ClamAV setup.
