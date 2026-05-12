# CLAUDE.md — SmartTabs for ChatGPT

## Project Overview

Chrome extension (Manifest V3) that injects a floating sidebar into ChatGPT conversations. The sidebar auto-generates one tab per user message and lets users create named bookmarks that persist across page reloads. Clicking a tab or bookmark scrolls the conversation to that point and flashes/highlights it. Works on `https://chatgpt.com/*` and `https://chat.openai.com/*`.

Entry point: `src/content.ts` → compiled to `dist/content.js` by Vite.

---

## Architecture

| File | Role |
|------|------|
| `src/content.ts` | Entry point. Owns all mutable state (`sectionMap`, `removedKeys`, `autoTabsEnabled`, `currentChatKey`). Drives the parse → merge → render loop. Handles localStorage persistence for bookmarks. Sets up the MutationObserver and 500ms SPA-navigation polling. |
| `src/parser.ts` | Pure DOM reader. Exports `parseSections()` which queries `[data-message-author-role="user"]` nodes and returns `Section[]`. Also exports the `Section` interface. No side effects. |
| `src/sidebar.ts` | All UI. Exports `renderSidebar()` and `resetSidebarState()`. Manages scroll-tracking, active-tab highlighting, click-to-jump, text highlighting, rename/remove interactions, help modal, and the `⌘/Ctrl+B` bookmark keybind. |
| `src/styles.css` | All CSS for the injected sidebar. Loaded directly by the manifest (not bundled into JS). Fixed-position glass-morphism panel at `left: 270px`. |
| `manifest.json` | MV3 manifest. Injects `dist/content.js` + `src/styles.css` on `chatgpt.com` and `chat.openai.com`. Declares `storage` permission (unused — see Known Issues). |
| `vite.config.ts` | Single-entry Vite build: `src/content.ts` → `dist/content.js`. No chunking. |
| `dist/content.js` | Compiled output. Committed to the repo (intentional for extension distribution). |
| `tsconfig.json` | Target ES2020, `moduleResolution: Bundler`, strict mode, `verbatimModuleSyntax`. |

---

## Section Model

Defined in `src/parser.ts:1–14`:

```typescript
export interface Section {
  id: string;               // realTurnId or generated "smart-{index}-{hash}"
  title: string;            // display label in the sidebar
  element: HTMLElement;     // live DOM container (set to document.body for restored bookmarks)
  rawText: string;          // normalised user message text (after stripping "You said:")
  contextText?: string;     // first 1500 chars of the full container textContent
  selectedText?: string;    // text the user had selected when creating a bookmark
  role?: "user" | "assistant";
  scrollTop?: number;       // scrollContainer.scrollTop at bookmark creation time
  offsetWithinMessage?: number; // scrollTop - messageTop (relative offset inside message)
  domOrder: number;         // index in DOM (for auto tabs) or Date.now() (for bookmarks)
  turnId: string;           // same as id; used as a stable re-find key
  type?: "auto" | "bookmark";
}
```

`StoredBookmark` in `src/content.ts:15` is `Omit<Section, "element">` — the `element` field is stripped before writing to localStorage.

---

## Verified ChatGPT DOM Selectors

Extracted from `src/parser.ts` and `src/sidebar.ts`:

| Selector | Purpose |
|----------|---------|
| `[data-message-author-role="user"]` | Primary selector for user message nodes. Used in `parseSections()` and `findLiveElement()` / `getCenterVisibleElement()`. |
| `[data-message-author-role="assistant"]` | Assistant message nodes. Used in `findLiveElement()` and `getCenterVisibleElement()`. |
| `[data-turn-id-container]` | Attribute on the wrapping container of each conversation turn. Read as the stable `turnId`. Used for direct re-lookup in `findLiveElement()` via `[data-turn-id-container="${section.turnId}"]`. |
| `[data-testid*="conversation-turn"]` | First fallback container in `findMessageContainer()` / `getMessageContainer()`. |
| `article` | Second fallback container. |
| `main` | Fallback scroll target when `activeScrollContainer` is null during bookmark jump (`sidebar.ts:710`). |
| `#smart-tabs-sidebar` | The injected sidebar div (`SIDEBAR_ID`). |
| `#smart-tabs-collapsed` | The collapsed "Tabs" pill button (`COLLAPSED_ID`). |
| `#smart-tabs-help-modal` | Help modal overlay. |

---

## Key Rules

**Identity / keying**
- `getKey(section)` in `content.ts:17–19` returns `section.id || section.turnId || section.rawText.toLowerCase()`. This is the Map key for deduplication in `sectionMap`.
- `turnId` that starts with `"smart-"` is a generated fallback; only real `turnId`s (from `data-turn-id-container`) are used for direct DOM re-lookup in `findLiveElement()`.

**Parse → merge, never overwrite titles**
- `mergeSections()` (`content.ts:114–130`) preserves an existing section's `title` when merging a re-parsed section with the same key. This keeps user-renamed tabs stable across re-parses.

**Debouncing**
- DOM mutation → `scheduleInit()` debounces at **250ms** (`content.ts:224`).
- Scroll events → `handleScroll()` debounces at **150ms** (`sidebar.ts:584`).

**SPA navigation detection**
- `window.setInterval` polls `window.location.href` every **500ms** because ChatGPT is a React SPA and does not fire `load` events on navigation (`content.ts:242–247`).
- Extension only activates when `window.location.pathname.startsWith("/c/")` (`isInChat()`, `content.ts:25–27`).

**Bookmark persistence**
- Stored in `localStorage` under key `"smart-tabs-bookmarks-v2"` as a JSON object keyed by chat pathname (`/c/<uuid>`).
- On restore, `element` is set to `document.body` as a placeholder; `findLiveElement()` re-resolves the real element using a scoring algorithm.

**`findLiveElement()` scoring** (`sidebar.ts:147–252`)
- Role match: +80
- Exact `selectedText` match: +400
- `selectedText` chunks (4 slices): +220 each
- Exact `rawText` match: +180
- `rawText` chunks (4 slices): +120 each
- `contextText` chunks (4 slices): +60 each
- Returns `null` if best score ≤ 0.

**`simpleHash()`**
- `(hash * 31 + charCode) | 0` polynomial hash, result in base36. Defined identically in both `parser.ts:20–28` and `content.ts:29–37` (duplicated).

**Sorting order in `getOrderedSections()`** (`content.ts:87–101`)
- Bookmarks come before auto tabs.
- Within bookmarks: descending `domOrder` (newest first, since `domOrder = Date.now()`).
- Within auto tabs: ascending `domOrder` (DOM order / message index).

**Bookmark creation shortcuts**
- `⌘/Ctrl+B` (not in a text input/textarea/contenteditable) → `createBookmarkFromCurrentView()`.
- `+` button in sidebar header → same function.
- If text is selected inside a message, the bookmark captures `selectedText` and uses `highlightTextInside()` on jump.
- If no text selected, uses the message closest to vertical center of viewport.

**CSS injection**
- `src/styles.css` is injected by the manifest, not bundled. Changes to CSS take effect without a Vite rebuild (just reload the extension).

---

## Known Issues

1. **`autoToggle` button created twice, first setup is dead code.**
   In `sidebar.ts`, `autoToggle` is created and configured in the header block, but those assignments are overwritten before the button is appended to the list section. The initial setup has no effect. The button only ever appears in the list section with class `smart-tabs-auto-toggle-section-btn`.

2. **Restored bookmarks use `document.body` as the placeholder element.**
   `content.ts:66` sets `element: document.body` when loading bookmarks from localStorage. If `findLiveElement()` scores everything ≤ 0 (e.g., the chat content hasn't loaded yet), a bookmark click falls through to the `scrollTop` absolute-position fallback — which may be wrong if the conversation layout has shifted.

3. **No guard against multiple `observeChanges()` calls.**
   `observeChanges()` creates a `MutationObserver` and a `setInterval` each time it's called. It's only called once on `window load`, so this is not currently a problem, but there is no idempotency guard.

4. **`onToggleHidden` callback is a no-op.**
   `content.ts:101`: `onToggleHidden: () => {}`. The sidebar's Hide/Show cycle works via `sidebar.ts`'s module-level `isHidden` flag without calling back to `content.ts`. The callback is wired up but never implemented.

---

## Build

```bash
npm install       # installs vite + typescript
npm run build     # runs: vite build → writes dist/content.js
```

**Loading the extension in Chrome:**
1. Go to `chrome://extensions` → Enable "Developer mode".
2. Click "Load unpacked" → select the repo root (where `manifest.json` lives).
3. CSS changes (`src/styles.css`) apply after reloading the extension — no rebuild needed.
4. TypeScript changes require `npm run build` before reloading.

**Output:** `dist/content.js` (single flat IIFE bundle, no chunks).

**TypeScript version:** `^6.0.3` (via devDependencies).  
**Vite version:** `^8.0.10`.
