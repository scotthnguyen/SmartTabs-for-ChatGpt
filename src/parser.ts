export interface Section {
  id: string;
  title: string;
  element: HTMLElement;
  rawText: string;
  contextText?: string;
  selectedText?: string;
  role?: "user" | "assistant";
  scrollTop?: number;
  offsetWithinMessage?: number;
  domOrder: number;
  turnId: string;
  type?: "auto" | "bookmark";
}

function normalizeText(text: string): string {
  return text.replace(/^You said:\s*/i, "").replace(/\s+/g, " ").trim();
}

export function simpleHash(text: string): string {
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
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
  const fileName = getFileName(container);
  const imageAttached = hasImage(container);
  const cleanedText = normalizeText(userText);

  if (fileName) {
    const lower = fileName.toLowerCase();

    if (lower.endsWith(".pdf")) return "PDF attached";
    return "File attached";
  }

  if (imageAttached) return "Image attached";
  if (cleanedText) return cleanedText;

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
    const generatedId = `smart-${index}-${simpleHash(
      rawText || container.textContent || ""
    )}`;
    const id = realTurnId || generatedId;

    const contextText = (container.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);

    sections.push({
      id,
      title: makeTitle(rawText, container),
      element: container,
      rawText,
      contextText,
      role: "user",
      domOrder: index,
      turnId: realTurnId || generatedId,
      type: "auto"
    });
  });

  return sections;
}