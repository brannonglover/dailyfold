// Words that appear in headlines and clip titles without saying what they are about
// ("Atlanta United" must not match "Man United").
const GENERIC_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'after', 'into', 'over', 'that', 'this', 'than',
  'his', 'her', 'its', 'their', 'who', 'why', 'how', 'what', 'when', 'will', 'has', 'have',
  'are', 'was', 'were', 'not', 'but', 'out', 'new', 'says', 'said', 'now', 'get', 'gets',
  'united', 'city', 'town', 'club', 'team', 'game', 'games', 'win', 'wins', 'loss', 'goal',
  'goals', 'play', 'plays', 'season', 'match', 'highlights', 'video', 'watch', 'live',
  'analysis', 'recap', 'report', 'news', 'update', 'updates',
  'big', 'best', 'top', 'first', 'last', 'time', 'week', 'weeks', 'year', 'years',
]);

function subjectTokens(text: string): Set<string> {
  const tokens = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token))
    // Crude plural/possessive fold so "Seahawks" matches "Seahawk's".
    .map((token) => token.replace(/s$/, ''));
  return new Set(tokens);
}

/**
 * Publishers (ESPN above all) attach a "related" clip about a person or team mentioned in a
 * story, which reads as a mismatch under the headline. A clip with a caption is kept only
 * when the caption shares a subject word with the headline. No caption means no evidence
 * either way (the video sits in the article body), so it is kept.
 */
export function videoMatchesHeadline(caption: string | undefined, title: string): boolean {
  const cleaned = caption?.trim();
  if (!cleaned) return true;

  const titleTokens = subjectTokens(title);
  for (const token of subjectTokens(cleaned)) {
    if (titleTokens.has(token)) return true;
  }
  return false;
}
