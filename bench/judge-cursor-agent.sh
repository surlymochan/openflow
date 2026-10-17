#!/usr/bin/env bash
# LLM judge runner for openflow bench/llm-arm.mjs: prompt on stdin, cwd = fixture copy.

export PATH="${NODE22_BIN:-/usr/local/bin}:$PATH"
P="$(cat)"
exec timeout --kill-after=5 300 "$HOME/.local/bin/cursor-agent" -p --trust --force --model grok-4.7-high --output-format text -- "$P" </dev/null
