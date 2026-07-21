#!/bin/bash
echo ""
echo "Paste your GitHub Personal Access Token, then press Enter:"
echo "(Get one at: github.com/settings/tokens — needs 'repo' scope)"
echo ""
read -s TOKEN

if [ -z "$TOKEN" ]; then
  echo "No token entered. Exiting."
  exit 1
fi

git remote remove github 2>/dev/null
git remote add github "https://${TOKEN}@github.com/shadowsys-memphis/guardian.git"

echo ""
echo "Pushing to shadowsys-memphis/guardian..."
git push github master

if [ $? -eq 0 ]; then
  echo ""
  echo "Done. GitHub is now in sync."
else
  echo ""
  echo "Push failed. Check that the token has 'repo' scope and the repo name is correct."
fi

git remote remove github
