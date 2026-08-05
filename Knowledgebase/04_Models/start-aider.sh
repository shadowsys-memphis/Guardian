#!/usr/bin/env zsh
# start-aider.sh
# Primary:    LM Studio (local, auto-detects loaded model)
# Fallback 1: Claude  (Anthropic)
# Fallback 2: Gemini  (Google — tier selected via GEMINI_TIER env var)
# Fallback 3: Codex   (OpenAI)
#
# Gemini tiers (set GEMINI_TIER=<name> to pick):
#   gemini-3.1-pro-deep   → gemini-3.1-pro,   32k think tokens  [default]
#   gemini-3.1-pro        → gemini-3.1-pro,   10k think tokens
#   gemini-3.5-flash      → gemini-3.5-flash,  8k think tokens
#   gemini-2.5-flash      → gemini-2.5-flash,  8k think tokens

cd "$(dirname "$0")"

# ── 1. LM Studio (local) ──────────────────────────────────────────────────────
if curl -s -I http://localhost:1234/v1/models >/dev/null 2>&1; then
  MODEL_ID=$(curl -s http://localhost:1234/v1/models | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    print(data["data"][0]["id"])
except Exception:
    print("")
')
  if [ -z "$MODEL_ID" ]; then
    MODEL_ID="google/gemma-4-12b-qat"
    echo "\033[0;33mLM Studio: no model detected, defaulting to $MODEL_ID\033[0m"
  else
    echo "\033[0;32mLM Studio: detected model → $MODEL_ID\033[0m"
  fi
  echo "\033[0;34mCodebase: $(pwd)\033[0m"
  exec aider \
    --openai-api-base http://localhost:1234/v1 \
    --openai-api-key lm-studio \
    --model "openai/$MODEL_ID" \
    --no-show-model-warnings
fi

echo "\033[0;33mLM Studio not running — checking cloud fallbacks...\033[0m"

# ── 2. Claude ─────────────────────────────────────────────────────────────────
if [ -n "$ANTHROPIC_API_KEY" ]; then
  MODEL="${AIDER_MODEL:-claude-sonnet-4-6}"
  echo "\033[0;32mFallback → Claude ($MODEL)\033[0m"
  echo "\033[0;34mCodebase: $(pwd)\033[0m"
  exec aider --model "$MODEL" --no-show-model-warnings
fi

# ── 3. Gemini ─────────────────────────────────────────────────────────────────
if [ -n "$GEMINI_API_KEY" ]; then
  GEMINI_TIER="${GEMINI_TIER:-gemini-3.1-pro-deep}"

  case "$GEMINI_TIER" in
    gemini-3.1-pro-deep)
      GMODEL="gemini/gemini-3.1-pro"
      GTHINK=32000
      GLABEL="Gemini 3.1 Pro — deep think (32k tokens)"
      ;;
    gemini-3.1-pro)
      GMODEL="gemini/gemini-3.1-pro"
      GTHINK=10000
      GLABEL="Gemini 3.1 Pro (10k tokens)"
      ;;
    gemini-3.5-flash)
      GMODEL="gemini/gemini-3.5-flash"
      GTHINK=8000
      GLABEL="Gemini 3.5 Flash (8k tokens)"
      ;;
    gemini-2.5-flash)
      GMODEL="gemini/gemini-2.5-flash"
      GTHINK=8000
      GLABEL="Gemini 2.5 Flash (8k tokens)"
      ;;
    *)
      echo "\033[0;31mUnknown GEMINI_TIER: $GEMINI_TIER\033[0m"
      echo "Valid tiers: gemini-3.1-pro-deep, gemini-3.1-pro, gemini-3.5-flash, gemini-2.5-flash"
      exit 1
      ;;
  esac

  echo "\033[0;32mFallback → $GLABEL\033[0m"
  echo "\033[0;34mCodebase: $(pwd)\033[0m"
  exec aider \
    --model "$GMODEL" \
    --thinking-tokens "$GTHINK" \
    --no-show-model-warnings
fi

# ── 4. Codex / OpenAI ────────────────────────────────────────────────────────
if [ -n "$OPENAI_API_KEY" ]; then
  MODEL="${CODEX_MODEL:-gpt-4o}"
  echo "\033[0;32mFallback → Codex/OpenAI ($MODEL)\033[0m"
  echo "\033[0;34mCodebase: $(pwd)\033[0m"
  exec aider --model "$MODEL" --no-show-model-warnings
fi

# ── No backend available ──────────────────────────────────────────────────────
echo "\033[0;31mNo backend available.\033[0m"
echo ""
echo "  • Start LM Studio on port 1234                              (local)"
echo "  • export ANTHROPIC_API_KEY=sk-ant-...                       (Claude)"
echo "  • export GEMINI_API_KEY=...                                  (Gemini)"
echo "      GEMINI_TIER=gemini-3.1-pro-deep  [default — 32k think]"
echo "      GEMINI_TIER=gemini-3.1-pro       [10k think]"
echo "      GEMINI_TIER=gemini-3.5-flash     [8k think]"
echo "      GEMINI_TIER=gemini-2.5-flash     [8k think]"
echo "  • export OPENAI_API_KEY=sk-...                               (Codex)"
exit 1
