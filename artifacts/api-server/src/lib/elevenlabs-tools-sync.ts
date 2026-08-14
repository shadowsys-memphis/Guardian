/**
 * Registers Jessica's real-time voice tools (Task #116) with ElevenLabs so
 * they're available for the agent to call during a live phone conversation.
 *
 * Mechanism (per ElevenLabs' current API — the legacy `prompt.tools` array
 * was fully removed mid-2025): create-or-update each tool via
 * POST/PATCH /v1/convai/tools, then GET the agent and PATCH
 * conversation_config.agent.prompt.tool_ids with our tool IDs merged into
 * whatever was already there — never a blind overwrite, so we never clobber
 * a tool Ray configured by hand.
 *
 * This function is designed to be safe to call anytime and always resolve
 * (never throw): at server startup before ElevenLabs may even be
 * configured, and from the manual "Sync Jessica's Tools" Settings button.
 */
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureJessicaToolSecret } from "./jessica-tools";
import { logger } from "./logger";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const TOOL_IDS_SETTINGS_KEY = "jessica_tool_ids";

type ToolKey =
  | "add_task"
  | "remove_task"
  | "reschedule_task"
  | "update_daily_call_schedule"
  | "complete_task"
  | "refuse_task";

export type SyncJessicaToolsResult =
  | { ok: true; message: string; tools: Record<string, string> }
  | { ok: false; reason: "missing_config" | "missing_base_url" | "elevenlabs_error" | "unknown_error"; message: string };

function buildToolConfigs(baseUrl: string, secret: string): Array<{ key: ToolKey; config: Record<string, unknown> }> {
  // A literal header value (not an ElevenLabs-managed secret reference) —
  // it's a token we mint and control end-to-end, not a user credential, and
  // this is the same pattern ElevenLabs' own docs use for simple bearer
  // tokens. Only visible inside Ray's own ElevenLabs dashboard.
  const requestHeaders = { "X-Jessica-Tool-Secret": secret };

  return [
    {
      key: "add_task",
      config: {
        type: "webhook",
        name: "add_task",
        description:
          "Adds a new task, reminder, or event to Pops' daily schedule. Call this whenever Pops or Ray asks to add something to the schedule during the call. Always resolve the time to 24-hour HH:MM Pacific before calling — ask a quick clarifying question first if no specific time was given.",
        response_timeout_secs: 15,
        tool_error_handling_mode: "auto",
        api_schema: {
          url: `${baseUrl}/jessica/tools/add-task`,
          method: "POST",
          request_headers: requestHeaders,
          request_body_schema: {
            type: "object",
            required: ["title", "time"],
            properties: {
              title: { type: "string", description: "The task, reminder, or event name — e.g. 'take pills' or 'afternoon walk'." },
              time: { type: "string", description: "The time for this task in 24-hour HH:MM Pacific time, e.g. '15:00' for 3:00 PM. Always convert whatever time was spoken into this exact format." },
              details: { type: "string", description: "Optional short context about the task." },
            },
          },
        },
      },
    },
    {
      key: "remove_task",
      config: {
        type: "webhook",
        name: "remove_task",
        description:
          "Removes an existing task or event from Pops' daily schedule. Call this whenever Pops or Ray asks to take something off the schedule.",
        response_timeout_secs: 15,
        tool_error_handling_mode: "auto",
        api_schema: {
          url: `${baseUrl}/jessica/tools/remove-task`,
          method: "POST",
          request_headers: requestHeaders,
          request_body_schema: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string", description: "The name (or a close description) of the task to remove, as it would appear on the schedule." },
            },
          },
        },
      },
    },
    {
      key: "reschedule_task",
      config: {
        type: "webhook",
        name: "reschedule_task",
        description:
          "Moves an existing task on Pops' daily schedule to a new time. Call this whenever Pops or Ray asks to change when something happens.",
        response_timeout_secs: 15,
        tool_error_handling_mode: "auto",
        api_schema: {
          url: `${baseUrl}/jessica/tools/reschedule-task`,
          method: "POST",
          request_headers: requestHeaders,
          request_body_schema: {
            type: "object",
            required: ["title", "time"],
            properties: {
              title: { type: "string", description: "The name (or a close description) of the task to reschedule, as it would appear on the schedule." },
              time: { type: "string", description: "The new time in 24-hour HH:MM Pacific time, e.g. '15:00' for 3:00 PM." },
            },
          },
        },
      },
    },
    {
      key: "complete_task",
      config: {
        type: "webhook",
        name: "complete_task",
        description:
          "Marks a task on Pops' daily schedule as done. Call this ONLY when Pops (or a family member on the call) explicitly confirms the thing actually happened — e.g. he says he drank the water, ate breakfast, or took care of Koda. Never call it just because you asked or reminded him. For water check-ins specifically: only after he confirms drinking it during this call. For breakfast: ask how much he ate (all, some, or none) — call this for 'all' or 'some'; if he ate nothing, use refuse_task instead. For Koda: done means out, fed, and watered — a walk is a separate bonus, and bad weather or a health issue never makes the dog task a failure.",
        response_timeout_secs: 15,
        tool_error_handling_mode: "auto",
        api_schema: {
          url: `${baseUrl}/jessica/tools/complete-task`,
          method: "POST",
          request_headers: requestHeaders,
          request_body_schema: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string", description: "The name (or a close description) of the task that was completed, as it would appear on the schedule." },
              source: { type: "string", description: "Who confirmed it: 'spoken' if Pops himself said so (the default), 'family' if a family member on the call confirmed it." },
            },
          },
        },
      },
    },
    {
      key: "refuse_task",
      config: {
        type: "webhook",
        name: "refuse_task",
        description:
          "Records that Pops explicitly declined a task on his schedule — he said no, he's not going to do it (including eating none of a meal). This is different from him simply not answering or changing the subject; only call it on a clear refusal. After recording it, do not pressure him — acknowledge kindly and move on.",
        response_timeout_secs: 15,
        tool_error_handling_mode: "auto",
        api_schema: {
          url: `${baseUrl}/jessica/tools/refuse-task`,
          method: "POST",
          request_headers: requestHeaders,
          request_body_schema: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string", description: "The name (or a close description) of the task he declined, as it would appear on the schedule." },
            },
          },
        },
      },
    },
    {
      key: "update_daily_call_schedule",
      config: {
        type: "webhook",
        name: "update_daily_call_schedule",
        description:
          "Turns Pops' automated daily check-in call on or off, and/or changes what time it happens. Only Ray should be changing this — the server only allows it on a call verified to be with Ray, and will decline (with a spoken explanation) otherwise. The daily call can only be scheduled between 6:00 AM and 8:00 PM Pacific.",
        response_timeout_secs: 15,
        tool_error_handling_mode: "auto",
        api_schema: {
          url: `${baseUrl}/jessica/tools/update-daily-call`,
          method: "POST",
          // Extra caller-identity headers (on top of the shared secret) so
          // the server can enforce "this must actually be Ray" rather than
          // trusting the LLM's prompt instructions — see isCallWithRay() in
          // jessica-tools.ts. These are ElevenLabs system dynamic variables:
          // auto-populated per call, never configured by us at call time.
          request_headers: {
            ...requestHeaders,
            "X-Called-Number": "{{system__called_number}}",
            "X-Caller-Id": "{{system__caller_id}}",
          },
          request_body_schema: {
            type: "object",
            required: [],
            properties: {
              enabled: { type: "boolean", description: "Whether the automated daily call should be turned on (true) or off (false). Omit if only the time is changing." },
              time: { type: "string", description: "The new daily call time in 24-hour HH:MM Pacific time, between 06:00 and 20:00. Omit if only turning the call on/off." },
            },
          },
        },
      },
    },
  ];
}

async function getStoredToolIds(): Promise<Partial<Record<ToolKey, string>>> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, TOOL_IDS_SETTINGS_KEY));
  if (!rows[0]?.value) return {};
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return {};
  }
}

async function saveToolIds(ids: Partial<Record<ToolKey, string>>): Promise<void> {
  const value = JSON.stringify(ids);
  const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, TOOL_IDS_SETTINGS_KEY));
  if (existing.length > 0) {
    await db.update(appSettingsTable).set({ value, updatedAt: new Date() }).where(eq(appSettingsTable.key, TOOL_IDS_SETTINGS_KEY));
  } else {
    await db.insert(appSettingsTable).values({ key: TOOL_IDS_SETTINGS_KEY, value });
  }
}

/**
 * Idempotent: safe to call repeatedly (startup, and Ray's manual "Sync"
 * button). Existing tools are updated in place via their stored ID rather
 * than recreated, so re-running this never produces duplicate tools.
 */
export async function syncJessicaToolsToElevenLabs(): Promise<SyncJessicaToolsResult> {
  try {
    const apiKey = process.env["ELEVENLABS_API_KEY"];
    const agentId = process.env["ELEVENLABS_AGENT_ID"];
    if (!apiKey || !agentId) {
      return {
        ok: false,
        reason: "missing_config",
        message: "ElevenLabs isn't configured yet (missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID) — voice tool-calling will be enabled automatically once it is.",
      };
    }

    const baseUrl = process.env["GUARDIAN_API_BASE"];
    if (!baseUrl) {
      return { ok: false, reason: "missing_base_url", message: "GUARDIAN_API_BASE is not set — can't register a public webhook URL with ElevenLabs." };
    }

    const secret = await ensureJessicaToolSecret();
    const toolIds = await getStoredToolIds();
    const defs = buildToolConfigs(baseUrl, secret);

    for (const def of defs) {
      const existingId = toolIds[def.key];
      if (existingId) {
        const patchRes = await fetch(`${ELEVENLABS_BASE}/convai/tools/${existingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
          body: JSON.stringify({ tool_config: def.config }),
        });
        if (patchRes.ok) continue;
        if (patchRes.status !== 404) {
          const errBody = await patchRes.text().catch(() => "");
          logger.warn({ tool: def.key, status: patchRes.status, errBody }, "[JessicaTools] Failed to update existing tool — will try to recreate");
        }
        // 404 (or any other failure) — fall through and recreate below.
      }

      const createRes = await fetch(`${ELEVENLABS_BASE}/convai/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({ tool_config: def.config }),
      });
      if (!createRes.ok) {
        const errBody = await createRes.text().catch(() => "unknown");
        return { ok: false, reason: "elevenlabs_error", message: `Failed to create tool "${def.key}": ${errBody}` };
      }
      const created = (await createRes.json()) as { id: string };
      toolIds[def.key] = created.id;
    }

    await saveToolIds(toolIds);

    const agentRes = await fetch(`${ELEVENLABS_BASE}/convai/agents/${agentId}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!agentRes.ok) {
      const errBody = await agentRes.text().catch(() => "unknown");
      return { ok: false, reason: "elevenlabs_error", message: `Tools were created, but couldn't read the agent to attach them: ${errBody}` };
    }
    const agentData = (await agentRes.json()) as {
      conversation_config?: { agent?: { prompt?: { tool_ids?: string[] } } };
    };
    const currentToolIds = agentData.conversation_config?.agent?.prompt?.tool_ids ?? [];
    const ourToolIds = Object.values(toolIds).filter((id): id is string => !!id);
    const mergedToolIds = Array.from(new Set([...currentToolIds, ...ourToolIds]));

    const alreadyAttached = ourToolIds.every((id) => currentToolIds.includes(id));
    if (!alreadyAttached) {
      const patchAgentRes = await fetch(`${ELEVENLABS_BASE}/convai/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({
          conversation_config: { agent: { prompt: { tool_ids: mergedToolIds } } },
        }),
      });
      if (!patchAgentRes.ok) {
        const errBody = await patchAgentRes.text().catch(() => "unknown");
        return { ok: false, reason: "elevenlabs_error", message: `Tools were created, but couldn't attach them to the agent: ${errBody}` };
      }
    }

    return {
      ok: true,
      message: `Jessica's task & schedule tools are synced (${defs.length} tools) and attached to the agent.`,
      tools: toolIds as Record<string, string>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[JessicaTools] Sync failed — non-fatal");
    return { ok: false, reason: "unknown_error", message: `Sync failed: ${message}` };
  }
}
