import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

router.post("/calendar/events", async (req, res) => {
  const token = req.headers["x-google-access-token"] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Missing x-google-access-token header. Grant Google Calendar access first." });
    return;
  }

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
    const endIso = body.endTime ?? new Date(new Date(body.startTime).getTime() + 30 * 60000).toISOString();
    event.end = { dateTime: endIso, timeZone: "America/New_York" };

    const mins = body.reminderMinutes !== undefined ? body.reminderMinutes : 30;
    event.reminders = {
      useDefault: false,
      overrides: mins > 0 ? [{ method: "popup", minutes: mins }] : [],
    };
  }

  try {
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.status === 401 || response.status === 403) {
        res.status(403).json({ error: "Google Calendar access denied. Re-grant permissions in your Google Account.", details: err });
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
  const token = req.headers["x-google-access-token"] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Missing x-google-access-token header. Grant Google Drive access first." });
    return;
  }

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
    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.status === 401 || response.status === 403) {
        res.status(403).json({ error: "Google Drive access denied. Re-grant permissions in your Google Account.", details: err });
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
