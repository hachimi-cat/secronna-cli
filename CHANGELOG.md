# Changelog

## 0.3.0
- `secronna api webhooks update <id>` (`--enabled`, `--url`, `--events`, `--description`): pause, resume or edit an endpoint; `secronna api webhook-deliveries list | get <id> | retry <id>`: the delivery log across endpoints, and retry; `secronna api webhooks event-types`. Outbound webhooks are retried (1 min, 5 min, 25 min, 2 h, 12 h; 6 attempts), every attempt is recorded, and an endpoint that keeps failing for a day is switched off (`disabledAt`, `disabledReason`; `secronna.webhook_endpoint.disabled` goes to your other endpoints).

## 0.2.3
- `secronna auth login` now signs in for real: the Huudis device flow (prints a code, opens the browser, saves the session to `~/.secronna/session.json` and refreshes it when it expires), or `--api-key <key>` (`-` reads stdin) to save an access key for machines and CI.
- `secronna auth whoami` shows the Huudis user or which key is in use; `secronna auth logout` deletes the saved credentials. All three take `--json`.
- `SECRONNA_TOKEN` in the environment now works for every command and wins over the saved sign-in.

## 0.2.2
- `secronna api <area> <action>`: every feature route of the API as a command, generated from the API spec (scripts/apigen.sh), with flags typed from the spec.

## 0.2.1
- Package metadata now points at the public mirror repo (github.com/hachimi-cat/secronna-cli).
