---
name: GitHub autopush can fail auth silently for days
description: This workspace has a background autopush mechanism (.git/autopush.log) that pushes commits to GitHub automatically and self-heals ref conflicts via rebase, but a real auth/token failure only gets recorded as a local log line + a GITHUB-SYNC-FAILED.txt file — nothing actively alerts the user, so it can sit broken for days before anyone notices.
---

Observed: GitHub rejected pushes with "Invalid username or token. Password authentication is not supported for Git operations." starting one day, and it wasn't fixed until roughly 2.5 days later (a different agent noticed and did a manual push that cleared it). During that whole window, local commits kept happening normally — only the push to GitHub silently failed each cycle.

**Why:** when a user reports vague "everything breaks for no reason" / "github" complaints, this is a real, recurring failure mode here, not a one-off. The alert file is passive (just sits in the repo root) and nothing surfaces it in the UI the user actually looks at.

**How to apply:** when git-sync issues are reported, immediately check `tail -50 .git/autopush.log` for auth failures and `ls GITHUB-SYNC-FAILED.txt` (its presence means it's currently broken; its absence doesn't prove it's been healthy the whole time — read the log for the history). Compare `git rev-parse master` vs `origin/master` directly rather than trusting a prior summary. If local is ahead with a clean `git status`, it's usually safe to `git push origin master` directly to resolve the drift.
