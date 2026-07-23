import type { ColorScheme } from '@/constants/Colors';
import Colors from '@/constants/Colors';
import { stripGuardianRegistrationModalHtml } from '@/catalog/guardianLiveBlogSidebar';

export type WebViewReaderArticle = {
  title: string;
  byline?: string;
  content: string;
  siteName?: string;
  baseUrl?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a themed HTML document for in-app Reader mode from Readability output. */
export function buildWebViewReaderHtml(
  article: WebViewReaderArticle,
  scheme: ColorScheme,
): string {
  const colors = Colors[scheme];
  const title = escapeHtml(article.title.trim() || 'Article');
  const byline = article.byline?.trim() ? escapeHtml(article.byline.trim()) : '';
  const siteName = article.siteName?.trim() ? escapeHtml(article.siteName.trim()) : '';
  const meta = [siteName, byline].filter(Boolean).join(' · ');
  const baseHref = article.baseUrl?.trim();
  const content = stripGuardianRegistrationModalHtml(article.content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  ${baseHref ? `<base href="${escapeHtml(baseHref)}" />` : ''}
  <style>
    :root {
      color-scheme: ${scheme};
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: ${colors.background};
      color: ${colors.text};
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 17px;
      line-height: 1.7;
      padding: 20px 22px 48px;
      -webkit-text-size-adjust: 100%;
    }
    .meta {
      font-size: 13px;
      letter-spacing: 0.2px;
      color: ${colors.textSecondary};
      margin: 0 0 12px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 28px;
      line-height: 1.25;
      letter-spacing: -0.3px;
      font-weight: 700;
      margin: 0 0 20px;
      color: ${colors.text};
    }
    article img,
    article picture img,
    article figure img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      margin: 16px 0;
      background: ${colors.surface};
    }
    article figure {
      margin: 16px 0;
      padding: 0;
    }
    article figcaption,
    article .caption {
      font-size: 13px;
      line-height: 1.4;
      color: ${colors.textSecondary};
      font-style: italic;
      margin-top: 6px;
    }
    article p {
      margin: 0 0 1.05em;
    }
    article h2, article h3, article h4 {
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.3;
      margin: 1.4em 0 0.6em;
    }
    article a {
      color: ${colors.accent};
    }
    article blockquote {
      margin: 1.2em 0;
      padding: 0 0 0 14px;
      border-left: 3px solid ${colors.border};
      color: ${colors.textSecondary};
    }
    article pre, article code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.92em;
    }
    article pre {
      overflow-x: auto;
      padding: 12px;
      border-radius: 10px;
      background: ${colors.surface};
      border: 1px solid ${colors.border};
    }
    article ul, article ol {
      padding-left: 1.25em;
      margin: 0 0 1em;
    }
    article iframe, article video {
      max-width: 100%;
    }
  </style>
</head>
<body>
  ${meta ? `<p class="meta">${meta}</p>` : ''}
  <h1>${title}</h1>
  <article>${content}</article>
</body>
</html>`;
}
