import { parse as parseHtml } from 'node-html-parser';
import type { Issue, IssueContent, Article } from './buttondown';

export const SITE_URL = 'https://urbanpadel.pl';
export const SITE_NAME = 'UrbanPadel Weekly';
export const DEFAULT_DESCRIPTION =
  'UrbanPadel Weekly - cotygodniowy newsletter o polskiej scenie padla.';
export const PUBLISHER_LOGO = `${SITE_URL}/favicon-256.png`;

/** Build an absolute URL on the canonical origin. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/** Strip all HTML tags, decode entities, collapse whitespace. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return parseHtml(html).text.replace(/\s+/g, ' ').trim();
}

const PL_DIACRITICS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ż: 'z', ź: 'z',
};

/** URL-safe slug with Polish-diacritic transliteration. */
export function slugify(text: string, maxLen = 60): string {
  let slug = (text || '')
    .toLowerCase()
    .replace(/[ąćęłńóśżź]/g, (c) => PL_DIACRITICS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip any remaining combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > maxLen) {
    slug = slug.slice(0, maxLen).replace(/-+[^-]*$/, '').replace(/-+$/, '');
  }
  return slug || 'wpis';
}

/** Word-safe truncation. Adds an ellipsis unless `ellipsis` is false. */
export function truncate(text: string, n = 155, ellipsis = true): string {
  const t = (text || '').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!–-]+$/, '');
  return ellipsis ? `${trimmed}…` : trimmed;
}

/** Plain-text headline of the issue's lead (first) story. */
export function leadHeadline(content: IssueContent): string {
  return stripHtml(content.articles?.[0]?.headlineHtml ?? '');
}

/** Per-issue-unique slug for a single story (number prefix avoids collisions). */
export function storySlug(article: Article): string {
  return `${article.number}-${slugify(stripHtml(article.headlineHtml))}`;
}

/** A story is substantial enough for its own page if it has more than a bare headline. */
export function hasStorySubstance(article: Article): boolean {
  return (
    !!stripHtml(article.bodyHtml) ||
    article.stats.length > 0 ||
    !!article.rankingBoard ||
    !!article.callout ||
    !!article.quote
  );
}

/** Split a story badge label into its leading emoji/symbol accent and a clean text name + slug. */
export function parseCategoryLabel(rawLabel: string): { emoji: string; name: string; slug: string } {
  const label = stripHtml(rawLabel).trim();
  const m = label.match(/^([^\p{L}]+)\s*(.*)$/u);
  const emoji = (m?.[1] ?? '').trim();
  const name = ((m?.[2] ?? label).trim()) || label;
  return { emoji, name, slug: slugify(name) };
}

/** Path to a standalone story page. */
export function storyUrl(issueSlug: string, article: Article): string {
  return `/issues/${issueSlug}/${storySlug(article)}/`;
}

/** First clause of a headline (cut at a dash/colon) when it's long enough to stand alone. */
export function headlineClause(text: string): string {
  const first = text.split(/\s+[–—-]\s+|:\s+/)[0].trim();
  return first.length >= 20 ? first : text;
}

/**
 * Topical heading for an issue — used for both the hidden <h1> and the <title>.
 * Front-loads the lead story (the keyword-bearing part), then the series name.
 */
export function issueHeading(issue: Issue, content: IssueContent): string {
  const num = issue.number.toString().padStart(3, '0');
  const base = `Padel Polska Weekly #${num}`;
  const lead = leadHeadline(content);
  return lead ? `${truncate(headlineClause(lead), 75, false)} — ${base}` : base;
}

/** Full <title> for an issue page (identical to the H1 — concise, brand included via the series name). */
export function issueTitle(issue: Issue, content: IssueContent): string {
  return issueHeading(issue, content);
}

/** Unique meta description for an issue, with a graceful fallback chain. */
export function metaDescription(issue: Issue, content: IssueContent): string {
  const fromDesc = (issue.description ?? '').trim();
  if (fromDesc) return truncate(fromDesc);

  const fromIntro = stripHtml(content.introHtml);
  if (fromIntro) return truncate(fromIntro);

  const headlines = (content.articles ?? [])
    .slice(0, 3)
    .map((a) => stripHtml(a.headlineHtml))
    .filter(Boolean);
  if (headlines.length) return truncate(headlines.join(' · '));

  return DEFAULT_DESCRIPTION;
}

// ── JSON-LD builders ─────────────────────────────────────────────────────────

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: PUBLISHER_LOGO,
  };
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: 'pl-PL',
  };
}

export function newsArticleLd(opts: {
  headline: string;
  description: string;
  datePublished: string;
  url: string;
  image?: string;
}) {
  const article: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: opts.headline,
    description: opts.description,
    inLanguage: 'pl-PL',
    url: opts.url,
    mainEntityOfPage: opts.url,
    image: opts.image ?? PUBLISHER_LOGO,
    author: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: PUBLISHER_LOGO },
    },
  };
  if (opts.datePublished) article.datePublished = opts.datePublished;
  return article;
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
