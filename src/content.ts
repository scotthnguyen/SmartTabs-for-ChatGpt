import { parseSections, type Section } from "./parser";
import { renderSidebar, resetSidebarState } from "./sidebar";

console.log("[SmartTabs] content script loaded", window.location.href);

let updateTimeout: number | null = null;
let currentChatKey = "";
let autoTabsEnabled = true;

const STORAGE_KEY = "smart-tabs-bookmarks-v1";

const sectionMap = new Map<string, Section>();
const removedKeys = new Set<string>();

type StoredBookmark = Omit<Section, "element">;

function getKey(section: Section): string {
  return section.id || section.turnId || section.rawText.toLowerCase();
}

function getChatKey(): string {
  return window.location.pathname;
}

function isInChat(): boolean {
  return window.location.pathname.startsWith("/c/");
}

function simpleHash(text: string): string {
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function removeSidebarFromPage() {
  document.getElementById("smart-tabs-sidebar")?.remove();
  document.getElementById("smart-tabs-collapsed")?.remove();
}

function getStoredBookmarks(): Record<string, StoredBookmark[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveBookmarksForCurrentChat() {
  if (!currentChatKey) return;

  const allBookmarks = getStoredBookmarks();

  const bookmarks: StoredBookmark[] = Array.from(sectionMap.values())
    .filter((section) => section.type === "bookmark")
    .map(({ element, ...rest }) => rest);

  allBookmarks[currentChatKey] = bookmarks;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(allBookmarks));
}

function loadBookmarksForCurrentChat() {
  const allBookmarks = getStoredBookmarks();
  const bookmarks = allBookmarks[currentChatKey] || [];

  bookmarks.forEach((bookmark) => {
    const restored: Section = {
      ...bookmark,
      element: document.body
    };

    sectionMap.set(getKey(restored), restored);
  });
}

function resetForNewChat() {
  sectionMap.clear();
  removedKeys.clear();
  resetSidebarState();
  loadBookmarksForCurrentChat();
}

function getOrderedSections(): Section[] {
  return Array.from(sectionMap.values())
    .filter((section) => !removedKeys.has(getKey(section)))
    .filter((section) => autoTabsEnabled || section.type === "bookmark")
    .sort((a, b) => {
      if (a.type === "bookmark" && b.type !== "bookmark") return -1;
      if (a.type !== "bookmark" && b.type === "bookmark") return 1;

      if (a.type === "bookmark" && b.type === "bookmark") {
        return b.domOrder - a.domOrder;
      }

      return a.domOrder - b.domOrder;
    });
}

function renderCurrentSidebar() {
  renderSidebar(getOrderedSections(), {
    autoTabsEnabled,
    onRemoveTab: removeTab,
    onRenameTab: renameTab,
    onToggleHidden: () => {},
    onToggleAutoTabs: toggleAutoTabs
  });
}

function mergeSections(newSections: Section[]) {
  newSections.forEach((section) => {
    if (!autoTabsEnabled && section.type !== "bookmark") return;

    const key = getKey(section);
    const existing = sectionMap.get(key);

    if (existing) {
      sectionMap.set(key, {
        ...section,
        title: existing.title
      });
    } else {
      sectionMap.set(key, section);
    }
  });

  renderCurrentSidebar();
}

function removeTab(section: Section) {
  removedKeys.add(getKey(section));

  if (section.type === "bookmark") {
    sectionMap.delete(getKey(section));
    saveBookmarksForCurrentChat();
  }

  renderCurrentSidebar();
}

function renameTab(section: Section, newTitle: string) {
  const key = getKey(section);
  const existing = sectionMap.get(key);

  if (!existing) return;

  sectionMap.set(key, {
    ...existing,
    title: newTitle
  });

  if (existing.type === "bookmark") {
    saveBookmarksForCurrentChat();
  }

  renderCurrentSidebar();
}

function toggleAutoTabs() {
  autoTabsEnabled = !autoTabsEnabled;

  if (!autoTabsEnabled) {
    for (const section of Array.from(sectionMap.values())) {
      if (section.type !== "bookmark") {
        sectionMap.delete(getKey(section));
      }
    }
  }

  renderCurrentSidebar();
}

function findBookmarkContainer(anchorElement: HTMLElement): HTMLElement | null {
  const messageNode = anchorElement.closest<HTMLElement>(
    '[data-message-author-role="user"], [data-message-author-role="assistant"]'
  );

  if (!messageNode) return null;

  return (
    messageNode.closest<HTMLElement>("[data-turn-id-container]") ||
    messageNode.closest<HTMLElement>('[data-testid*="conversation-turn"]') ||
    messageNode.closest<HTMLElement>("article") ||
    messageNode.parentElement ||
    messageNode
  );
}

function createBookmarkFromSelection() {
  if (!isInChat()) return;

  const selection = window.getSelection();
  let selectedText = selection?.toString().trim();

  if (!selection || !selectedText) return;

  const range = selection.getRangeAt(0).cloneRange();

  if (range.startOffset > 0) {
    range.setStart(range.startContainer, range.startOffset - 1);
  }

  selectedText = range.toString().trim();

  const anchorNode = selection.anchorNode;
  const anchorElement =
    anchorNode instanceof HTMLElement
      ? anchorNode
      : anchorNode?.parentElement;

  if (!anchorElement) return;

  const container = findBookmarkContainer(anchorElement);
  if (!container) return;

  const containerText = container.textContent || "";
  const realTurnId = container.getAttribute("data-turn-id-container") ?? "";
  const generatedTurnId = `smart-bookmark-target-${simpleHash(containerText)}`;
  const turnId = realTurnId || generatedTurnId;

  const bookmarkId = `bookmark-${turnId}-${Date.now()}`;

  const contextText = (container.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);

  const bookmark: Section = {
    id: bookmarkId,
    title: `★ ${selectedText.slice(0, 60)}`,
    element: container,
    rawText: selectedText,
    contextText,
    domOrder: Date.now(),
    turnId,
    type: "bookmark"
  };

  sectionMap.set(getKey(bookmark), bookmark);
  saveBookmarksForCurrentChat();
  renderCurrentSidebar();

  selection.removeAllRanges();
}

function init() {
  const newChatKey = getChatKey();

  if (!isInChat()) {
    resetForNewChat();
    removeSidebarFromPage();
    currentChatKey = newChatKey;
    return;
  }

  if (newChatKey !== currentChatKey) {
    currentChatKey = newChatKey;
    resetForNewChat();
    renderCurrentSidebar();
  }

  const parsed = parseSections();

  console.log("[SmartTabs] parsed sections", {
    count: parsed.length,
    userNodes: document.querySelectorAll('[data-message-author-role="user"]').length
  });

  mergeSections(parsed);
}

function shouldIgnoreMutation(mutations: MutationRecord[]): boolean {
  return mutations.every((mutation) => {
    const target = mutation.target as HTMLElement | null;
    if (!target) return false;
    return !!target.closest("#smart-tabs-sidebar");
  });
}

function scheduleInit() {
  if (updateTimeout !== null) {
    window.clearTimeout(updateTimeout);
  }

  updateTimeout = window.setTimeout(() => {
    init();
  }, 250);
}

function observeChanges() {
  const observer = new MutationObserver((mutations) => {
    if (shouldIgnoreMutation(mutations)) return;
    scheduleInit();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  let lastHref = window.location.href;

  window.setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      scheduleInit();
    }
  }, 500);
}

document.addEventListener("keydown", (event) => {
  const isBookmarkShortcut =
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "b";

  if (!isBookmarkShortcut) return;

  event.preventDefault();
  createBookmarkFromSelection();
});

window.addEventListener("load", () => {
  window.setTimeout(() => {
    currentChatKey = getChatKey();
    resetForNewChat();
    init();
    observeChanges();
  }, 1500);
});