#!/bin/bash
TOKEN="${GITHUB_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "GITHUB_TOKEN secret not found. Add it in Replit Secrets first."
  exit 1
fi

git remote remove github 2>/dev/null
git remote add github "https://${TOKEN}@github.com/shadowsys-memphis/guardian.git"

echo "Pushing to shadowsys-memphis/guardian..."
git push github master

if [ $? -eq 0 ]; then
  echo "Done. GitHub is now in sync."
else
  echo "Push failed. Check token has 'repo' scope and repo name is correct."
fi

git remote remove github
