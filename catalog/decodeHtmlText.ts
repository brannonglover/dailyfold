const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
};

function codePointToChar(code: number): string | null {
  if (!Number.isFinite(code) || code < 0 || code > 0x10_ffff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

/** Decode named and numeric HTML entities (e.g. &#8217;, &amp;, &rsquo;). */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const decoded = codePointToChar(parseInt(entity.slice(2), 16));
      return decoded ?? match;
    }

    if (entity.startsWith('#')) {
      const decoded = codePointToChar(parseInt(entity.slice(1), 10));
      return decoded ?? match;
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Normalize RSS text fields: decode entities and collapse whitespace. */
export function decodeFeedText(text: string | null | undefined): string {
  if (!text) return '';
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

/** Strip HTML tags and decode entities for article body/excerpt fields. */
export function stripAndDecodeHtml(html: string): string {
  return decodeFeedText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  );
}
