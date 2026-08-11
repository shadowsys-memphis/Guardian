---
name: Replit connectors SDK (Google Calendar/Drive) usage
description: How to call Google APIs through @replit/connectors-sdk's proxy from backend code, and a subtle datetime gotcha with Google Calendar event bodies.
---

# Replit Connectors SDK — Server-Side Usage

## Rule — `ReplitConnectors().proxy(connectorName, path, options)`
Instantiate `new ReplitConnectors()` once at module scope (cheap; it resolves fresh auth per call, so this is safe — unlike the SDK's client-object pattern used elsewhere, there's nothing to go stale). Call `connectors.proxy("google-calendar" | "google-drive" | ..., "<path relative to googleapis.com, e.g. /calendar/v3/calendars/primary/events>", { method, headers?, body? })`. `body` can be passed as a raw JS object OR a pre-serialized string (both were verified to work — the SDK/underlying fetch handles either) as long as `Content-Type` isn't already set to something incompatible (multipart uploads need an explicit `Content-Type` header with the boundary and a string body).

Treat proxy response status 401/403/404 as "integration not connected for this workspace" (message like "No google-calendar connection found for this customer") and surface a clear 403 to the client rather than a raw 500 — genuine per-request failures (bad payload, quota) come back as other 4xx/5xx with a normal Google API error body.

**Why:** This is the replacement for a client-supplied OAuth token; the proxy holds/refreshes credentials outside the app entirely.

## Rule — never mix naive and absolute date-times when an explicit `timeZone` is set
Google Calendar event bodies that set `timeZone` (e.g. `{ dateTime: "2026-08-10T09:00:00", timeZone: "America/New_York" }`) expect **both** `start.dateTime` and `end.dateTime` to be in the same form — either both naive wall-clock strings (no `Z`/offset) or both absolute-instant strings. If one is naive and the other is computed by round-tripping through `new Date(...).toISOString()` (which stamps a `Z` and reinterprets the naive digits as UTC), the two ends can resolve to inconsistent instants — e.g. a naive "09:00 America/New_York" start (→ 13:00 UTC) paired with a "09:30Z" computed end (→ 05:30 America/New_York) makes end < start. Google rejects this with a 400 `reason: "timeRangeEmpty"` / "The specified time range is empty" — a misleading error that has nothing to do with query-parameter time ranges and everything to do with the event body itself.

**Why:** Silent and easy to reintroduce — the request round-trips through valid-looking, independently-plausible ISO strings and only fails once both are combined against a real calendar.

**How to apply:** When computing a default/derived date-time from a start time whose format (naive vs `Z`-qualified) isn't fixed, detect which form the input already uses (e.g. regex `/Z$|[+-]\d{2}:\d{2}$/`) and preserve that form in the output rather than defaulting to `.toISOString()`.
