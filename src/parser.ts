export interface Section {
  id: string;
  title: string;
  element: HTMLElement;
  rawText: string;
  contextText?: string;
  domOrder: number;
  turnId: string;
  type?: "auto" | "bookmark";
}

function normalizeText(text: string): string {
  return text.replace(/^You said:\s*/i, "").replace(/\s+/g, " ").trim();
}

function simpleHash(text: string): string {
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function cleanTitle(text: string): string {
  let t = normalizeText(text);

  t = t.replace(
    /^(can you|could you|help me|please|i need|how do i|what about|also)\s+/i,
    ""
  );

  const words = t.split(" ").slice(0, 7);
  const result = words.join(" ").trim();

  if (!result) return "";
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function getFileName(container: HTMLElement): string | null {
  const text = container.textContent ?? "";

  const match = text.match(
    /[\w\s()._-]+\.(pdf|docx?|pptx?|xlsx?|csv|txt|png|jpe?g|webp)/i
  );

  return match ? match[0].trim() : null;
}

function hasImage(container: HTMLElement): boolean {
  return Boolean(container.querySelector("img"));
}

function makeTitle(userText: string, container: HTMLElement): string {
  const cleanedText = cleanTitle(userText);
  const fileName = getFileName(container);
  const imageAttached = hasImage(container);

  let attachmentLabel = "";

  if (fileName) {
    attachmentLabel = fileName;
  } else if (imageAttached) {
    attachmentLabel = "Image attached";
  }

  if (cleanedText && attachmentLabel) return `${cleanedText} — ${attachmentLabel}`;
  if (cleanedText) return cleanedText;
  if (attachmentLabel) return attachmentLabel;

  return "Untitled";
}

function findMessageContainer(messageNode: HTMLElement): HTMLElement {
  return (
    messageNode.closest<HTMLElement>("[data-turn-id-container]") ||
    messageNode.closest<HTMLElement>('[data-testid*="conversation-turn"]') ||
    messageNode.closest<HTMLElement>("article") ||
    messageNode.parentElement ||
    messageNode
  );
}

export function parseSections(): Section[] {
  const sections: Section[] = [];

  const userNodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-message-author-role="user"]')
  );

  userNodes.forEach((userNode, index) => {
    const container = findMessageContainer(userNode);
    const rawText = normalizeText(userNode.textContent ?? "");

    if (!rawText && !hasImage(container) && !getFileName(container)) return;

    const realTurnId = container.getAttribute("data-turn-id-container") ?? "";
    const generatedId = `smart-${index}-${simpleHash(rawText || container.textContent || "")}`;
    const id = realTurnId || generatedId;

    sections.push({
      id,
      title: makeTitle(rawText, container),
      element: container,
      rawText,
      domOrder: index,
      turnId: realTurnId || generatedId,
      type: "auto"
    });
  });

  return sections;
}