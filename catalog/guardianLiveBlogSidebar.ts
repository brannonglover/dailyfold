const KEY_EVENTS_HEADING = /^key events$/i;
const PREAMBLE_HEADING = /^preamble$/i;
const TIME_AGO_MARKER = /^\d+[hm]\s*ago$/i;
/** Guardian promotional tip blocks, e.g. "Pro-tip in this article: …" */
const PRO_TIP_MARKER = /^pro[- ]tip\b/i;
/** Soft-registration modal heading that Readability sometimes keeps. */
const REGISTRATION_START = /^this is not a paywall$/i;
const REGISTRATION_CLUSTER_MARKERS = [
  REGISTRATION_START,
  /enter your email to keep reading/i,
  /committed to keeping our quality reporting open/i,
  /^or$/i,
  /by proceeding, you agree to our/i,
  /^not signed in/i,
];
const BLOCK_OPEN_TAG =
  /<(p|h[1-6]|div|section|aside|blockquote)(\s[^>]*)?>/gi;
const TRAILING_GUARDIAN_BRAND =
  /<(?:p|h[1-6]|div)(?:\s[^>]*)?>\s*(?:<(?:span|strong|em|b|i)(?:\s[^>]*)?>\s*)*The Guardian\s*(?:<\/(?:span|strong|em|b|i)>\s*)*<\/(?:p|h[1-6]|div)>\s*$/i;

function normalizeParagraphText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Guardian live blogs sometimes collapse the Key events sidebar into one paragraph. */
export function isGuardianKeyEventsMegaParagraph(text: string): boolean {
  const normalized = normalizeParagraphText(text);
  if (!/^key events/i.test(normalized)) return false;

  const agoMatches = normalized.match(/\d+[hm]\s*ago/gi);
  return (agoMatches?.length ?? 0) >= 2;
}

export function isGuardianKeyEventsSidebarParagraph(text: string): boolean {
  const normalized = normalizeParagraphText(text);
  return (
    KEY_EVENTS_HEADING.test(normalized) ||
    PREAMBLE_HEADING.test(normalized) ||
    TIME_AGO_MARKER.test(normalized) ||
    isGuardianKeyEventsMegaParagraph(normalized)
  );
}

type ParagraphBlock = { type: string; text?: string };

/** Strips leading Guardian live-blog Key events sidebar paragraphs from reader blocks. */
export function filterLeadingGuardianKeyEventsSidebar<T extends ParagraphBlock>(blocks: T[]): T[] {
  if (blocks.length === 0) return blocks;

  let index = 0;
  let megaText: string | null = null;

  const first = blocks[0];
  if (first?.type === 'paragraph' && typeof first.text === 'string') {
    const text = normalizeParagraphText(first.text);
    if (isGuardianKeyEventsMegaParagraph(text)) {
      megaText = text;
      index = 1;
    }
  }

  if (megaText) {
    while (index < blocks.length) {
      const block = blocks[index]!;
      if (block.type !== 'paragraph' || typeof block.text !== 'string') break;

      const text = normalizeParagraphText(block.text);
      if (text.length >= 20 && megaText.includes(text)) {
        index += 1;
        continue;
      }

      break;
    }
  }

  let inSidebar = false;

  while (index < blocks.length) {
    const block = blocks[index]!;
    if (block.type !== 'paragraph' || typeof block.text !== 'string') break;

    const text = normalizeParagraphText(block.text);

    if (KEY_EVENTS_HEADING.test(text)) {
      inSidebar = true;
      index += 1;
      continue;
    }

    if (inSidebar) {
      if (PREAMBLE_HEADING.test(text)) {
        index += 1;
        break;
      }

      index += 1;
      continue;
    }

    break;
  }

  return blocks.slice(index);
}

export function isGuardianProTipParagraph(text: string): boolean {
  const normalized = normalizeParagraphText(text);
  return PRO_TIP_MARKER.test(normalized);
}

/** Strips Guardian live-blog Pro-tip promotional paragraphs from reader blocks. */
export function filterGuardianProTipParagraphs<T extends ParagraphBlock>(blocks: T[]): T[] {
  return blocks.filter((block) => {
    if (block.type !== 'paragraph' || typeof block.text !== 'string') return true;
    return !isGuardianProTipParagraph(block.text);
  });
}

export function isGuardianRegistrationModalStart(text: string): boolean {
  return REGISTRATION_START.test(normalizeParagraphText(text));
}

/** True for paragraphs that belong inside the Guardian soft-registration modal. */
export function isGuardianRegistrationModalParagraph(text: string): boolean {
  const normalized = normalizeParagraphText(text);
  return REGISTRATION_CLUSTER_MARKERS.some((marker) => marker.test(normalized));
}

/**
 * Strips Guardian soft-registration modal paragraphs ("This is not a paywall" …).
 * Drops contiguous runs that begin with the start heading, plus orphan modal lines
 * (except bare "or", which is too common to remove alone).
 */
export function filterGuardianRegistrationModalParagraphs<T extends ParagraphBlock>(
  blocks: T[],
): T[] {
  const result: T[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index]!;

    if (
      block.type === 'paragraph' &&
      typeof block.text === 'string' &&
      isGuardianRegistrationModalStart(block.text)
    ) {
      index += 1;
      while (index < blocks.length) {
        const next = blocks[index]!;
        if (next.type !== 'paragraph' || typeof next.text !== 'string') break;
        if (!isGuardianRegistrationModalParagraph(next.text)) break;
        index += 1;
      }
      continue;
    }

    if (
      block.type === 'paragraph' &&
      typeof block.text === 'string' &&
      isGuardianRegistrationModalParagraph(block.text) &&
      !/^or$/i.test(normalizeParagraphText(block.text))
    ) {
      index += 1;
      continue;
    }

    result.push(block);
    index += 1;
  }

  return result;
}

/**
 * Strip Guardian soft-registration modal HTML that WebView Readability sometimes keeps.
 * Cuts from the block containing "This is not a paywall" through the end of the excerpt
 * (the modal is trailing) and drops a preceding lone "The Guardian" brand heading.
 */
export function stripGuardianRegistrationModalHtml(html: string): string {
  if (!html || !/this is not a paywall/i.test(html)) return html;

  const markerMatch = /this is not a paywall/i.exec(html);
  if (!markerMatch || markerMatch.index == null) return html;

  const beforeMarker = html.slice(0, markerMatch.index);
  let cutAt = markerMatch.index;
  BLOCK_OPEN_TAG.lastIndex = 0;
  let openTag: RegExpExecArray | null;
  while ((openTag = BLOCK_OPEN_TAG.exec(beforeMarker)) !== null) {
    cutAt = openTag.index;
  }

  let cleaned = html.slice(0, cutAt).replace(/\s+$/u, '');
  cleaned = cleaned.replace(TRAILING_GUARDIAN_BRAND, '').replace(/\s+$/u, '');
  return cleaned;
}

/** Strips Guardian live-blog Key events, Pro-tip, and soft-registration modal copy. */
export function filterGuardianLiveBlogArtifacts<T extends ParagraphBlock>(blocks: T[]): T[] {
  return filterGuardianRegistrationModalParagraphs(
    filterGuardianProTipParagraphs(filterLeadingGuardianKeyEventsSidebar(blocks)),
  );
}
