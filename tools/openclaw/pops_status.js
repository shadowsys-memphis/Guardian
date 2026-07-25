/**
 * OpenClaw Skill: get_pops_status
 *
 * Fetches Pops' current Haldol cycle day and today's schedule
 * from the Guardian-OS backend via REST API.
 *
 * URL: set GUARDIAN_API_BASE in your OpenClaw environment, e.g.
 *   https://your-deployed-domain.replit.app/api
 */
async function run() {
  const base = process.env.GUARDIAN_API_BASE ?? "https://your-deployed-domain.replit.app/api";

  try {
    const [haldolRes, scheduleRes] = await Promise.all([
      fetch(`${base}/haldol`),
      fetch(`${base}/schedule`),
    ]);

    const haldolData = await haldolRes.json();
    const scheduleData = await scheduleRes.json();

    let context = `--- POPS' CURRENT STATE ---\n`;
    context += `Haldol Cycle Day: ${haldolData.dayOfCycle} / 14\n`;
    context += `Zombie Phase Active: ${haldolData.isZombiePhase ? "YES (Days 1-5 — keep interactions short & calm)" : "NO"}\n`;
    context += `Next Injection: ${new Date(haldolData.nextInjectionDate).toLocaleDateString()}\n\n`;

    const pending = scheduleData.filter((t) => t.status !== "Done");
    const completed = scheduleData.filter((t) => t.status === "Done");

    context += `--- TODAY'S TASKS ---\n`;
    context += `Completed (${completed.length}):\n`;
    completed.forEach((t) => {
      context += `  - [DONE] ${t.time}: ${t.title}\n`;
    });

    context += `\nPending (${pending.length}):\n`;
    pending.forEach((t) => {
      context += `  - [WAITING] ${t.time}: ${t.title}\n`;
    });

    return context;
  } catch (err) {
    return `Error retrieving Guardian-OS status: ${err.message}`;
  }
}

module.exports = {
  name: "get_pops_status",
  description: "Reads Pops' daily state (Haldol cycle day, zombie phase, and task progress) to give Jessica context for the call.",
  run,
};
