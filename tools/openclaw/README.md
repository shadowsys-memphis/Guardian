# OpenClaw Skills — Guardian-OS

These are the JavaScript skill files Jessica (the OpenClaw phone agent) loads to interact with Guardian-OS in real time during calls with Pops.

## Skills

### `complete_task.js`
Jessica calls this when Pops confirms he did something ("I took my meds", "I ate lunch").  
Sends a POST to `/api/schedule/:taskId/complete` and checks the task off on the Dashboard.

### `pops_status.js`
Fetches Pops' current Haldol cycle day, zombie phase status, and today's completed/pending tasks.  
Jessica uses this at the start of a call to get real context before speaking.

## Configuration

Set one environment variable in your OpenClaw agent settings:

```
GUARDIAN_API_BASE=https://your-deployed-domain.replit.app/api
```

Replace `your-deployed-domain` with the actual published domain from Replit → Deploy.

## Deployment

Upload each `.js` file to your OpenClaw agent's Skills section. They load as tool-callable functions with the names `complete_task` and `get_pops_status`.

## Notes

- The old hardcoded production URL (`ais-dev-immzmjj6lpnelg5cj4ren5-28709946245.us-east1.run.app`) has been removed.
- Both skills now read `GUARDIAN_API_BASE` from the environment so the URL follows the deployment, not the other way around.
- The Shadow Systems devops skills (`ss-*`) from the original ZIP were not imported — they were built for a different project (SPIII trading stack) and don't apply here.
