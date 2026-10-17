# omo arm — skipped

Status: **skipped: needs an OpenCode-compatible provider subscription or paid API key**.

`arms/omo.sh` records that sentence and exits. It does not call `cursor-agent`, `omo`, OpenCode, or senpi, and it does not read provider credentials.

## Why this arm is not a cursor-agent run

oh-my-openagent in this checkout (`<omo-dir>`, tag `v5.1.35`) is OmO Native. The `omo` command runs on **senpi**, a fork of pi, with the OmO extension built in. It is not a Cursor plugin and it does not speak the cursor-agent CLI.

Provider auth is senpi's own:

- `omo` then `/login` for Claude, ChatGPT, Kimi, or GLM subscriptions, or
- an OpenAI-compatible gateway / API key configured the way senpi and the older OpenCode edition expect (`omo setup` can carry keys across from an OpenCode install).

cursor-agent authenticates with a Cursor subscription (`cursor-agent login` / the local Cursor account). That credential is not an OpenCode or senpi provider key. Pointing `omo` at `grok-4.7-high` through Cursor's subscription is not a supported path, so a run would either fail auth or bill a different provider. This harness is not allowed to call paid APIs, so it does not try.

## What a real arm would need

1. Install OmO Native (`omo` 5.x on senpi). Node 24 or newer is what the upstream install notes ask for. The binary is `omo`, not `cursor-agent`.
2. Sign in with a provider senpi can actually call (`/login`, or a configured OpenAI-compatible base URL and key). Confirm with `omo doctor` that the task category has a live provider.
3. Invoke senpi's non-interactive / print path (`--message` or print mode — senpi decides the session is over in print mode) inside the same fresh task checkout this harness already builds. Do not pass Cursor's `--plugin-dir` or cursor-agent flags; they are a different process.
4. Read token counts from senpi's session usage (input, output, cache read, cache write if senpi reports them). cursor-agent `result.usage` will stay empty because cursor-agent never ran. Sum those figures the same way `run.py` sums cursor-agent calls, and keep the hidden-test step unchanged: copy `tasks/<id>/hidden/` in only after `omo` exits.
5. Keep the model identity explicit in the result row. It will not be `grok-4.7-high` unless that model is actually served by the senpi provider. Mixing it into the cursor-agent matrix would break the "same model" rule.

Until that subscription or key exists, leave this arm out of `--arms`. `run.py` records an omo row as skipped and `report.py` drops skipped rows from the success denominator.
