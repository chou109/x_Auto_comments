# X Reply Copilot

[中文](README.md) | English

A Chrome / Edge Manifest V3 extension that runs directly on X. It filters posts, generates or selects replies, automates replies, and provides an independent auto-post module.

## Features

- Scan the current X page or collect posts from an author or keyword search.
- Filter by author, keywords, likes, age, replies, quotes, and local reply history.
- Generate several reply suggestions with an OpenAI-compatible API, or use fixed reply content.
- Fill a reply manually or run a controlled automatic reply task.
- Run multi-round collection and reply loops with total, per-round, empty-round, hourly, daily, and active-hour safeguards.
- Publish fixed or AI-generated posts independently from reply settings.
- Use separate reply and post image libraries with probability, quantity, and selection-mode controls.
- Save and load reply/post profiles without mixing their content, images, or progress.
- Persist active tasks locally and recover them after navigation, background-tab throttling, or a browser restart.
- Pause, resume, end a task/round, or terminate a loop without losing unrelated settings.

## Interface language

The language button is beside **X Reply Copilot** in the injected panel header. Click **EN** to switch to English or **中** to switch to Chinese. The choice is saved per browser profile and synchronized to other open X tabs.

Only extension-owned labels, controls, task statuses, safeguards, and messages are localized. The extension does not translate or modify tweet text, generated replies/posts, fixed content, prompts, profile names, account IDs, image filenames, or the original detail returned by an API provider. X-page detection remains bilingual so the extension works with both Chinese- and English-localized X pages.

## Install

1. Open `chrome://extensions` (or `edge://extensions` in Edge).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project folder.
4. Open or refresh `https://x.com`; the floating panel appears in the upper-right corner.
5. Open Reply settings and enter an API key, API base URL, and model if AI features are needed.

## Use

1. On an X search, home, or profile page, scroll until the posts you need are loaded.
2. Set author IDs, keywords, minimum likes, age, and exclusion options in the panel.
3. Click **Scan current page**, or use automatic collection for an author or keyword search.
4. Open the Results tab to inspect posts and generate/fill a reply.
5. For automatic replies, choose the target count and click **Start**. The task processes the saved result list and reports sent/skipped progress.
6. For direct targets, enter one `/status/` URL per line and load the target posts.
7. For auto posting, open the Auto post tab, choose a destination and content source, then start the post task.

## Reply content

AI mode supports contextual replies and directed replies. Directed mode requires a saved prompt. Fixed-content mode supports multiple separate entries, sequential rotation, random selection, and numbered bulk import. The extension validates the complete text accepted by X before sending, including the non-empty content after image attachment.

## Automatic task safety

- Successful sends are counted only after X confirms the submission.
- Reply and post counters are separate and isolated by detected X account.
- Hourly limits use the local clock hour; daily limits use the local calendar day.
- When a limit or active-hour rule blocks a send, the task stays persisted and the task bar shows the current usage, a live readable countdown, and the exact local resume time.
- Background heartbeats and page-visibility recovery wake the owning tab without creating duplicate senders.
- Failed generation, missing editors, or unconfirmed submissions retry the current item; repeated failures can pause the task for inspection.
- If an X draft cannot be safely cleared, the extension pauses rather than risking a duplicate or navigation prompt.

## Data and privacy

Settings, profiles, image data URLs, usage counters, reply history, and task state are stored in the browser extension's local storage. The extension sends API requests only when an AI action is requested. User-authored text and provider error details are not rewritten by the language switch.

## Project files

- `content.js` — injected UI and X-page automation.
- `i18n.js` — Chinese/English runtime dictionary and locale helpers.
- `background.js` — API requests, task heartbeat, and tab wake-up.
- `styles.css` — injected panel styles.
- `manifest.json` — Manifest V3 configuration.
- `README.md` — Chinese documentation.
- `README.en.md` — this English documentation.
