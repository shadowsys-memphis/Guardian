import { Router, type IRouter } from "express";
import { z } from "zod";
import { ReplitConnectors } from "@replit/connectors-sdk";

const router: IRouter = Router();

// Managed OAuth for Google Calendar/Drive — the Replit connector handles
// authorization and token refresh outside the app, so no client ever
// supplies (or sees) a raw Google access/refresh token.
const connectors = new ReplitConnectors();

function isConnectorAccessError(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

// True when a date-time string already carries an explicit UTC/offset marker
// (e.g. "...Z" or "...-05:00") and therefore names an absolute instant.
function isQualifiedDateTime(dateTimeStr: string): boolean {
  return /Z$|[+-]\d{2}:\d{2}$/.test(dateTimeStr);
}

// Adds `minutes` to a date-time string while preserving whether it was an
// absolute instant or a naive wall-clock string (no timezone marker).
//
// This matters because `event.start`/`event.end` below always attach an
// explicit `timeZone`. If the default end time were computed by round-tripping
// a naive start through `new Date(...).toISOString()`, that reinterprets the
// naive wall-clock digits as UTC and stamps them with "Z" — pairing a
// UTC-absolute end with a naive, zone-qualified start of the same wall-clock
// digits produces an end that is *earlier* than the start once the zone
// offset is applied, and Google's API rejects the event with "The specified
// time range is empty." Keeping the naive form naive (and only resolving to
// UTC when the input was already absolute) keeps start/end consistent.
function addMinutesPreservingForm(dateTimeStr: string, minutes: number): string {
  if (isQualifiedDateTime(dateTimeStr)) {
    return new Date(new Date(dateTimeStr).getTime() + minutes * 60000).toISOString();
  }
  const asUtc = new Date(`${dateTimeStr}Z`);
  asUtc.setUTCMinutes(asUtc.getUTCMinutes() + minutes);
  return asUtc.toISOString().slice(0, 19);
}

router.post("/calendar/events", async (req, res) => {
  const body = z.object({
    summary: z.string(),
    description: z.string().optional(),
    startTime: z.string(),
    endTime: z.string().optional(),
    allDay: z.boolean().optional().default(false),
    reminderMinutes: z.number().int().min(0).optional(),
  }).parse(req.body);

  const event: Record<string, unknown> = {
    summary: body.summary,
    description: body.description,
  };

  if (body.allDay) {
    const dateStr = body.startTime.split("T")[0];
    event.start = { date: dateStr };
    event.end = { date: dateStr };
  } else {
    event.start = { dateTime: body.startTime, timeZone: "America/New_York" };
    const endIso = body.endTime ?? addMinutesPreservingForm(body.startTime, 30);
    event.end = { dateTime: endIso, timeZone: "America/New_York" };

    const mins = body.reminderMinutes !== undefined ? body.reminderMinutes : 30;
    event.reminders = {
      useDefault: false,
      overrides: mins > 0 ? [{ method: "popup", minutes: mins }] : [],
    };
  }

  try {
    const response = await connectors.proxy("google-calendar", "/calendar/v3/calendars/primary/events", {
      method: "POST",
      body: event,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (isConnectorAccessError(response.status)) {
        res.status(403).json({ error: "Google Calendar isn't connected. Ask the workspace owner to connect the Google Calendar integration.", details: err });
        return;
      }
      res.status(response.status).json({ error: "Failed to create calendar event", details: err });
      return;
    }

    const data = await response.json() as { htmlLink?: string; id?: string };
    res.json({ success: true, eventLink: data.htmlLink ?? null, eventId: data.id ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to call Google Calendar API");
    res.status(500).json({ error: "Failed to reach Google Calendar API" });
  }
});

router.post("/drive/export", async (req, res) => {
  const body = z.object({
    filename: z.string(),
    content: z.string(),
    mimeType: z.string().optional().default("text/plain"),
  }).parse(req.body);

  const metadata = { name: body.filename, mimeType: body.mimeType };
  const boundary = "--------brainboundary--------";
  const multipartBody =
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${body.mimeType}\r\n\r\n` +
    body.content +
    `\r\n--${boundary}--`;

  try {
    const response = await connectors.proxy(
      "google-drive",
      "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipartBody,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (isConnectorAccessError(response.status)) {
        res.status(403).json({ error: "Google Drive isn't connected. Ask the workspace owner to connect the Google Drive integration.", details: err });
        return;
      }
      res.status(response.status).json({ error: "Failed to upload to Google Drive", details: err });
      return;
    }

    const data = await response.json() as { webViewLink?: string; id?: string; name?: string };
    res.json({ success: true, link: data.webViewLink ?? null, fileId: data.id ?? null, filename: data.name ?? body.filename });
  } catch (err) {
    req.log.error({ err }, "Failed to call Google Drive API");
    res.status(500).json({ error: "Failed to reach Google Drive API" });
  }
});

export default router;
