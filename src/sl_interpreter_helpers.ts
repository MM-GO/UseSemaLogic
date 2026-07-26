export function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function decodeHtmlEntities(text: string): string {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.body.textContent ?? "";
}

export function buildSLInterpreterAnchor(originalText: string, interpretedText: string): string {
  const escapedTitle = escapeHtmlAttribute(interpretedText);
  const escapedSLText = escapeHtmlAttribute(interpretedText);
  const escapedText = escapeHtmlText(originalText);
  return `<a href="#sl-interpreter" data-sl-interpreter="1" data-sl-text="${escapedSLText}" title="${escapedTitle}">${escapedText}</a>`;
}

export function extractHtmlAttributeValue(tagText: string, attributeName: string): string {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escapedName}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "i");
  const match = tagText.match(re);
  return match ? decodeHtmlEntities(match[2] ?? "") : "";
}

export function extractSLInterpreterAnchorData(text: string): { visibleText: string; slText: string } | undefined {
  const match = text.match(/<a\b[^>]*\bdata-sl-interpreter\s*=\s*(['"])1\1[^>]*>([\s\S]*?)<\/a>/i);
  if (!match) { return undefined; }
  const tagText = match[0] ?? "";
  const innerText = decodeHtmlEntities(match[2] ?? "");
  const slText = extractHtmlAttributeValue(tagText, "data-sl-text") || extractHtmlAttributeValue(tagText, "title") || extractHtmlAttributeValue(tagText, "data-sl-ref");
  return { visibleText: innerText, slText };
}
