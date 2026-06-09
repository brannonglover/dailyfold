/** Legacy Unsplash placeholders — treated as "no image" in feed and reader. */
export const LEGACY_PLACEHOLDER_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=800&q=80',
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80',
] as const;

/** Substrings in image URLs that usually mean UI placeholders, not article photos. */
const PLACEHOLDER_URL_MARKERS = [
  'placeholder',
  'default-avatar',
  'default_avatar',
  'default-user',
  'default_user',
  'avatar-default',
  'avatar_placeholder',
  'avatar-placeholder',
  'profile-placeholder',
  'profile_placeholder',
  'profile-pic',
  'profile_pic',
  'no-image',
  'no_image',
  'noimage',
  'silhouette',
  'generic-user',
  'generic_user',
  'user-placeholder',
  'user_placeholder',
  'anonymous',
  'missing-image',
  'missing_image',
  'fallback-image',
  'fallback_image',
  'blank.gif',
  'spacer.gif',
  'pixel.gif',
  'transparent.gif',
  '/1x1',
  '1x1.',
] as const;

/** Alt text that usually labels author/UI images, not story photos. */
const PLACEHOLDER_ALT_MARKERS = [
  'avatar',
  'profile photo',
  'profile picture',
  'author photo',
  'author image',
  'user photo',
  'default user',
] as const;

/** Class names on <img> that usually mark avatars or chrome, not content. */
const PLACEHOLDER_CLASS_MARKERS = [
  'avatar',
  'author-photo',
  'author_photo',
  'profile-image',
  'profile_image',
  'user-image',
  'user_image',
  'byline',
] as const;

export function isArticlePlaceholderImageUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return true;

  if (LEGACY_PLACEHOLDER_IMAGE_URLS.some((legacy) => legacy === trimmed)) {
    return true;
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith('data:image/')) {
    if (lower.includes('gif') || trimmed.length < 220) return true;
  }

  if (lower.includes('gravatar.com') && /[?&]d=(mp|identicon|monsterid|wavatar)/.test(lower)) {
    return true;
  }

  return PLACEHOLDER_URL_MARKERS.some((marker) => lower.includes(marker));
}

export function isPlaceholderImageElement(img: Element): boolean {
  const src = img.getAttribute('src') ?? '';
  if (isArticlePlaceholderImageUrl(src)) return true;

  const alt = (img.getAttribute('alt') ?? '').toLowerCase();
  if (PLACEHOLDER_ALT_MARKERS.some((marker) => alt.includes(marker))) return true;

  const className = (img.getAttribute('class') ?? '').toLowerCase();
  if (PLACEHOLDER_CLASS_MARKERS.some((marker) => className.includes(marker))) return true;

  const parentClass = (img.parentElement?.getAttribute('class') ?? '').toLowerCase();
  if (PLACEHOLDER_CLASS_MARKERS.some((marker) => parentClass.includes(marker))) return true;

  return false;
}
