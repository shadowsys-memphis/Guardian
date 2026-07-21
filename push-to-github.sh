#!/bin/bash
TOKEN="${GITHUB_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "GITHUB_TOKEN secret not found."
  exit 1
fi

git remote remove github 2>/dev/null
git remote add github "https://${TOKEN}@github.com/shadowsys-memphis/guardian.git"

echo "Fetching from GitHub..."
git fetch github master

echo "Merging GitHub history (keeping our code on conflicts)..."
git merge github/master --allow-unrelated-histories --no-edit -s recursive -X ours

if [ $? -ne 0 ]; then
  echo "Merge failed."
  git merge --abort 2>/dev/null
  git remote remove github
  exit 1
fi

echo "Pushing to shadowsys-memphis/guardian..."
git push github master

if [ $? -eq 0 ]; then
  echo "Done. GitHub is now in sync."
else
  echo "Push failed."
fi

git remote remove github
