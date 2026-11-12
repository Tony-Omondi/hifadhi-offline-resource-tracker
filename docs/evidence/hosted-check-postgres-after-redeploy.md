# Hosted check: after restart

- URL: http://localhost:8079
- Run at: 2026-11-12T20:17:16+00:00
- Result: 4/4 passed

| Check | Result | Detail |
|---|---|---|
| GET /healthz answers 200 within 5 s | PASS | 200, 12 ms |
| Synced record survived the restart | PASS | quantity=80, location=Shelf 4 |
| Deleted record is still deleted | PASS |  |
| Operation-ID set survived: every old op answered 'duplicate' | PASS | 8 ops -> ['duplicate']; quantity=80 |
