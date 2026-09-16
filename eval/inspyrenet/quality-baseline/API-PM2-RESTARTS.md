# `background-remover-api` PM2 restarts (2026-09-16 investigation)

**Scope:** PM2 app `background-remover-api` only. Worker and other tenants not modified.

## Counter meaning

| Field | Value | Interpretation |
|-------|--------|----------------|
| `restarts` | **11** after stageMs deploy | **Lifetime** restart count for PM2 id **12** (includes manual `pm2 restart`, deploys, graceful SIGINT) |
| `unstable_restarts` | **0** | No PM2 crash-loop / rapid exit-restart streak |
| `exit_code` (last) | **0** | Last exit was clean |
| Current PID | 3953610 | After stageMs OpenAPI fix deploy (**2026-09-16**, API-only restart) |
| Node | 20.20.2 | Unchanged (API-only deploy does not require Node 22 bump) |

## Recent restart reasons (from out log)

| Approx time (UTC) | PID | Event |
|-------------------|-----|--------|
| 2026-09-16 ~08:00 | 2341677 | `signal: SIGINT` → graceful shutdown |
| 2026-09-16 ~08:00 | 3909698 | New listen on 3014 (deploy / `pm2 restart`) |
| 2026-09-16 ~08:05 | 3909698 | `signal: SIGINT` → graceful shutdown |
| 2026-09-16 ~08:05 | 3910788 | Current process (InSPyReNet ready redeploy) |

**Conclusion:** Recent restarts align with **operator deploy/restart (SIGINT)**, not OOM or uncaught exceptions. Earlier restarts (count toward 10) from historical `pm2 restart` / setup before today — no evidence of instability in last 81m uptime.

## Error log notes

- Repeated Hugging Face `Model initiate/done` lines: **BiRefNet ONNX still loaded at startup** (expected for health/rollback path even when photo engine is InSPyReNet).
- No stack traces tied to crash exits in tail; 401 `INVALID_API_KEY` lines are client auth noise, not restarts.

## Action

No restart-related code change required. Continue **API-only** deploys with `pm2 restart background-remover-api` (avoid `pm2 restart all`).
