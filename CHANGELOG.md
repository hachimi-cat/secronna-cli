# Changelog

## 0.2.3
- `secronna auth login` now signs in for real: the Huudis device flow (prints a code, opens the browser, saves the session to `~/.secronna/session.json` and refreshes it when it expires), or `--api-key <key>` (`-` reads stdin) to save an access key for machines and CI.
- `secronna auth whoami` shows the Huudis user or which key is in use; `secronna auth logout` deletes the saved credentials. All three take `--json`.
- `SECRONNA_TOKEN` in the environment now works for every command and wins over the saved sign-in.

## 0.2.2
- `secronna api <area> <action>`: every feature route of the API as a command, generated from the API spec (scripts/apigen.sh), with flags typed from the spec.

## 0.2.1
- Package metadata now points at the public mirror repo (github.com/hachimi-cat/secronna-cli).
