#!/bin/sh
# Installs the auto-push git hook for this workspace.
#
# Why this file is committed: git hooks live in .git/hooks/, which git never
# tracks. If Replit rebuilds this container the hook vanishes silently. This
# script is in the repo so it always survives — re-run it to restore auto-push:
#
#     sh scripts/install-autopush.sh
#
# What it does: every commit made here (yours, Replit Agent checkpoints, an
# agent's) is pushed to GitHub automatically. No command to remember.

set -e
GITDIR=$(git rev-parse --git-dir)
HOOK="$GITDIR/hooks/post-commit"

cat > "$HOOK" <<'HOOKEOF'
#!/bin/sh
# Auto-push every commit to GitHub. Installed by scripts/install-autopush.sh
# Disable with: rm .git/hooks/post-commit

command -v git-lfs >/dev/null 2>&1 && git lfs post-commit "$@"

(
  GITDIR=$(git rev-parse --git-dir)
  LOG="$GITDIR/autopush.log"
  TOP=$(git rev-parse --show-toplevel)
  ALERT="$TOP/GITHUB-SYNC-FAILED.txt"

  {
    echo "--- $(date -u '+%Y-%m-%d %H:%M:%S UTC') ---"

    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$branch" = "HEAD" ] || [ -z "$branch" ]; then
      echo "detached HEAD - skipping"; exit 0
    fi

    # Never touch the working tree if a merge/rebase is already in progress.
    if [ -e "$GITDIR/MERGE_HEAD" ] || [ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ]; then
      echo "merge/rebase in progress - skipping"; exit 0
    fi

    if git push origin "$branch" 2>&1; then
      rm -f "$ALERT"
      echo "pushed OK"
      exit 0
    fi

    echo "push rejected - attempting safe rebase"
    git fetch origin "$branch" 2>&1

    # --autostash protects uncommitted work; abort restores the tree exactly
    # as it was if anything conflicts. The working tree is never left broken.
    if git rebase --autostash "origin/$branch" 2>&1; then
      if git push origin "$branch" 2>&1; then
        rm -f "$ALERT"; echo "pushed OK after rebase"; exit 0
      fi
    else
      git rebase --abort 2>&1 || true
      echo "rebase conflicted - aborted, working tree restored untouched"
    fi

    # Loud, visible failure. A silent backup failure is worse than none.
    {
      echo "GITHUB AUTO-SYNC FAILED"
      echo
      echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
      echo "Your work is committed locally and is NOT lost."
      echo "It just has not reached GitHub."
      echo
      echo "This needs a human. Details: .git/autopush.log"
      echo "This file deletes itself once a push succeeds."
    } > "$ALERT"
    echo "WROTE ALERT: $ALERT"

  } >> "$LOG" 2>&1
) </dev/null >/dev/null 2>&1 &

exit 0
HOOKEOF

chmod +x "$HOOK"
echo "auto-push installed: $HOOK"
