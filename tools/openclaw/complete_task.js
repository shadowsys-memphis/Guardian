/**
 * OpenClaw Skill: complete_task
 *
 * Sends a webhook POST to Guardian-OS to mark a specific task as "Done".
 * Jessica uses this when Pops says over the phone "I took my meds."
 *
 * URL: set GUARDIAN_API_BASE in your OpenClaw environment, e.g.
 *   https://your-deployed-domain.replit.app/api
 */
async function run(args) {
  const { taskId } = args;

  if (!taskId) {
    return "Error: Missing taskId parameter. Cannot complete task.";
  }

  const base = process.env.GUARDIAN_API_BASE ?? "https://your-deployed-domain.replit.app/api";

  try {
    const res = await fetch(`${base}/schedule/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Failed with status ${res.status}`);
    }

    const data = await res.json();
    return `Success! Task "${data.task.title}" has been checked off on the Guardian-OS Dashboard.`;
  } catch (err) {
    return `Error marking task complete on Guardian-OS: ${err.message}`;
  }
}

module.exports = {
  name: "complete_task",
  description: "Marks a scheduled task as completed in Guardian-OS. Use when Pops says he finished something (took meds, ate, etc.).",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "The ID of the task to mark completed (e.g., 'task-1').",
      },
    },
    required: ["taskId"],
  },
  run,
};
