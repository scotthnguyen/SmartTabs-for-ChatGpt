# SmartTabs for ChatGPT

A Chrome extension that injects a lightweight navigation sidebar into ChatGPT conversations — making long chats feel navigable like a document outline rather than an endless scroll.

---

## The Problem

Long ChatGPT conversations are painful to navigate. Finding an earlier prompt, revisiting a specific answer, or jumping back to a key moment means scrolling through hundreds of messages manually. SmartTabs fixes this.

---

## Features

- **Auto-generated tabs** — sidebar entries are automatically created from your user messages as you chat
- **Manual bookmarks** — pin any exact location in a conversation, whether it's a highlighted passage or your current viewport position
- **Bookmark renaming** — give bookmarks meaningful names so you can find them later
- **Toggle auto-tabs** — turn off auto-tab generation while keeping your manual bookmarks visible
- **Persistent bookmarks** — bookmarks survive page refreshes and are stored per-chat
- **Works on existing chats** — not just new conversations; open any chat and the sidebar populates automatically
- **Local-first** — no data is sent externally; everything stays in your browser

---

## Installation

> Chrome Web Store listing coming soon. For now, install manually:

1. Clone this repository
   ```bash
   git clone https://github.com/scotthnguyen/SmartTabs-for-chatgpt.git
   cd SmartTabs-for-chatgpt
   ```

2. Install dependencies and build
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome and go to `chrome://extensions`

4. Enable **Developer mode** (top right toggle)

5. Click **Load unpacked** and select the `dist/` folder

6. Open [chatgpt.com](https://chatgpt.com) — the sidebar will appear automatically

---

## Usage

### Auto tabs
Every message you send to ChatGPT automatically generates a tab in the sidebar. Click any tab to jump directly to that point in the conversation.

### Bookmarks
- **Highlight text** in the conversation and click the bookmark button to save that exact location
- Or click the bookmark button without a selection to save your current scroll position
- Bookmarks appear below auto-tabs and persist across refreshes

### Renaming bookmarks
Double-click any bookmark label to rename it inline.

### Toggling auto-tabs
Use the toggle at the top of the sidebar to hide auto-generated tabs. Your manual bookmarks remain visible.

---

## Architecture

```
src/
├── content.ts      # Injects the sidebar UI into ChatGPT pages
├── parser.ts       # Parses ChatGPT conversation DOM into Section objects
├── sidebar.ts      # Renders the sidebar and handles user interactions
└── styles.css      # Sidebar styling
```

### Section model
Each navigation item is represented as a `Section` object:

```typescript
type Section = {
  id: string
  title: string
  rawText: string
  domOrder: number
  turnId: string
  type: "auto" | "bookmark"
  contextText?: string
}
```

### DOM strategy
The extension targets stable ChatGPT attributes like `[data-message-author-role="user"]` and avoids fragile class names wherever possible. `closest()` lookups with fallback selectors are used to resolve message containers.

### Bookmark resolution
When restoring a bookmark, the extension follows this fallback chain:
1. Direct DOM resolution
2. Context text matching
3. Scroll position restoration
4. Visual highlighting

This hybrid approach handles duplicate prompts and dynamic DOM updates reliably.

### Dynamic updates
A `MutationObserver` watches for newly generated messages, keeps tabs in sync, and prevents duplicate tab generation as conversations grow.

### Storage
Bookmarks are stored per-chat using `localStorage` and `chrome.storage`. No backend or database is used.

---

## Known Limitations

- ChatGPT DOM updates can occasionally break selectors — if the sidebar stops working, check for an extension update
- Duplicate prompts can create ambiguous bookmark matches
- Very large chats may lag due to ChatGPT's own performance limits, not the extension
- Attachments and images are less reliably resolved than text messages

---

## Development

```bash
npm install       # Install dependencies
npm run build     # Production build
npm run dev       # Watch mode for development
```

After any build, reload the extension at `chrome://extensions` to apply changes.

---

## Tech Stack

- **TypeScript**
- **Chrome Extensions Manifest V3**
- **MutationObserver API**
- **chrome.storage / localStorage**

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## License

MIT
