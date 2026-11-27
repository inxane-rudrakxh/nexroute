# NexRoute

NexRoute is a local-first desktop app that turns a project brief into a structured roadmap using Google's Gemini API. It stores generated plans and an encrypted Gemini API key on the user's device. NexRoute does not execute tasks, estimate provider quotas, or simulate usage.

## Run the desktop app

Requirements:

- Node.js 22 LTS and npm

```sh
npm ci
npm run dev
```

The development launcher starts Vite and the Electron desktop shell. The renderer uses a narrow Electron IPC bridge for plan and credential operations.

## Generate a roadmap

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys).
2. Open **Settings** in NexRoute, review the data-use notice, paste the key, and accept the notice.
3. Enter a project brief and target deadline, then choose **Generate with Gemini**.

NexRoute sends the brief and deadline to Google's Gemini API only when you generate a plan. The API key remains in the Electron main process and is encrypted using the operating system's credential store. Remove the key in Settings to prevent future requests; saved plans remain local.

Gemini model access and rate limits are controlled by Google and may change. Google's free-tier prompts and responses may be used to improve its products. To avoid charges, use an AI Studio project without billing enabled: NexRoute cannot enforce Google billing settings. Do not send secrets or confidential briefs.

NexRoute does not currently retrieve provider quotas or account-wide usage. It intentionally displays no quota balances, usage percentages, reset schedules, token forecasts, or simulated execution results.

## Landing page

The public product site is separate from the desktop renderer:

```sh
npm run site:dev
npm run site:build
```

Preview it at `http://127.0.0.1:4173`. To link its download cards to the latest release assets:

```sh
VITE_GITHUB_REPOSITORY=OWNER/REPOSITORY npm run site:build
```

The GitHub Pages workflow supplies the current repository automatically. Download buttons link directly to the Windows installer, Linux AppImage, and Intel or Apple Silicon macOS DMG attached to the latest GitHub Release.

## Desktop builds

Build the current host's app directory or installer:

```sh
npm run package:dir
npm run package
```

Native release targets are built on matching GitHub-hosted runners when a `v*` tag is pushed:

| Platform | Package |
|---|---|
| Linux x64 | AppImage |
| Windows x64 | NSIS installer |
| macOS Intel x64 | DMG |
| macOS Apple Silicon arm64 | DMG |

The release workflow uploads installers, publishes SHA-256 checksums, and creates a GitHub Release. Builds are unsigned until signing credentials are configured. Windows SmartScreen and macOS Gatekeeper may warn or block installation. Configure these repository Actions secrets before distributing broadly:

- Windows code-signing certificate: `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`
- Apple Developer ID certificate: `CSC_LINK` and `CSC_KEY_PASSWORD`
- Apple notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`

## Local data and security

- The desktop app does not expose a local TCP service.
- The renderer runs with Node integration disabled, context isolation and Chromium sandbox enabled, and a restrictive Content Security Policy.
- The preload exposes narrow plan and Gemini credential IPC methods. The main process validates the requesting frame and makes requests to a fixed HTTPS endpoint.
- Plans are stored in the user's application data directory. Writes use a same-directory temporary file, restrictive permissions where supported, atomic rename, schema validation, and a 200-plan cap.
- Gemini keys are encrypted with Electron `safeStorage`; Linux requires GNOME Keyring/Secret Service or KWallet. Keys are never returned to the renderer or written to plan files.
- Upgrading from an earlier prototype preserves valid Gemini-generated roadmaps and removes demo-only quota plans and reports.
- No analytics, cloud sync, task execution, or automatic updater is included.

## Tests and checks

```sh
npm test
npm run build
npm run site:build
npm audit
```

Tests cover roadmap validation, concurrent local writes, deletion, legacy-data migration, Gemini response handling, encrypted credential storage, and damaged or oversized local data.
