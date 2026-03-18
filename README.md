# Vencord (Custom Fork)

A custom fork of [Vencord](https://github.com/Vendicated/Vencord) with additional plugins.

## Custom Plugins

- **QuestCompleter** — Auto-complete Discord Quests from the toolbar

## Quick Install (Windows)

Double-click `install.bat` or run it from a terminal. It will:

1. Check for Node.js (installs it via winget if missing)
2. Install pnpm if needed
3. Install dependencies
4. Build Vencord
5. Inject into all installed Discord clients

```bat
install.bat
```

After it finishes, restart Discord.

## Manual Install

```bash
git clone https://github.com/Kira-Kohler/Vencord.git
cd Vencord
pnpm install
pnpm build
pnpm inject
```

## Disclaimer

Discord is trademark of Discord Inc. and solely mentioned for the sake of descriptivity.
Mention of it does not imply any affiliation with or endorsement by Discord Inc.

Client modifications are against Discord's Terms of Service. Use at your own risk.
