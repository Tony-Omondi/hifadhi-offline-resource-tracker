# Hosted check: functional

- URL: http://localhost:8079
- Run at: 2026-11-12T20:17:11+00:00
- Result: 10/10 passed

| Check | Result | Detail |
|---|---|---|
| GET /healthz answers 200 within 5 s | PASS | 200, 31 ms, database=ok |
| App shell is served at / | PASS |  |
| Service worker is served at /sw.js | PASS |  |
| Batch of 4 ops applied in queue order | PASS | applied, applied, applied, applied |
| Server state after ordered ops: 100 - 30 + 12 = 82 | PASS | quantity=82 |
| Resending the same batch: every op answered 'duplicate', nothing applied twice | PASS | duplicate, duplicate, duplicate, duplicate; quantity=82 |
| Lost reply then retry: applied once, retry answered 'duplicate' | PASS | first reply 503, retry duplicate, quantity=80 |
| Concurrent edits: later write wins whatever the arrival order | PASS | location=Shelf 4, older edit -> merged/theirs |
| Delete is applied as a tombstone and leaves the live list | PASS |  |
| Invalid op is rejected with a reason | PASS | delta must be a non-zero whole number |
