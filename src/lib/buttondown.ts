import { parse as parseHtml } from 'node-html-parser';
import { stripHtml, truncate, hasStorySubstance, parseCategoryLabel } from './seo';

export interface Issue {
  id: string;
  slug: string;
  number: number;
  title: string;
  description: string;
  topics: string[];
  publishedAt: string; // raw ISO timestamp from Buttondown (for JSON-LD / sitemap)
  dateRange: string;
  weekTag: string;
  weekRange: string;
  dropDate: string;
  year: string;
  permalink: string;
  isLatest: boolean;
}

export interface StatCell {
  value: string;
  label: string;
  color: 'acid' | 'magenta' | 'white';
}

export interface RankRow {
  rank: string;
  team: string;
  city: string;
}

export interface RankingBoard {
  title: string;
  context: string;
  rows: RankRow[];
}

export interface Callout {
  label: string;
  text: string;
}

export interface Article {
  number: string;
  categoryColor: string;
  categoryLabel: string;
  subtitle: string;
  date: string;
  location: string;
  tag: string;
  headlineHtml: string;
  stats: StatCell[];
  rankingBoard: RankingBoard | null;
  callout: Callout | null;
  quote: string;
  quoteAuthor: string;
  bodyHtml: string;
  readMoreUrl: string;
}

export interface IssueContent {
  introHtml: string;
  articles: Article[];
}

const BASE_URL = 'https://api.buttondown.email';

async function apiFetch(path: string) {
  const token = import.meta.env.BUTTONDOWN_API_KEY;
  if (!token) throw new Error('BUTTONDOWN_API_KEY is not set');
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) throw new Error(`Buttondown API ${res.status}: ${path}`);
  return res.json();
}

function parseIssueNumber(subject: string): number {
  const m = subject.match(/(?:wyd(?:anie)?\.?\s*|issue\s*|#\s*)(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}

function formatDateRange(publishDate: string): string {
  if (!publishDate) return '';
  const d = new Date(publishDate);
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

function formatWeekRange(publishDate: string): string {
  if (!publishDate) return '';
  const d = new Date(publishDate);
  const dayOfWeek = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    `${dt.getUTCDate().toString().padStart(2, '0')}.${(dt.getUTCMonth() + 1).toString().padStart(2, '0')}`;
  return `${fmt(monday)}–${fmt(sunday)}`;
}

function formatDropDate(publishDate: string): string {
  if (!publishDate) return '';
  const d = new Date(publishDate);
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

function weekTag(publishDate: string): string {
  if (!publishDate) return '';
  const d = new Date(publishDate);
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${weekNum.toString().padStart(2, '0')}.${thu.getUTCFullYear()}`;
}

async function fetchAll(path: string): Promise<any[]> {
  const results: any[] = [];
  let url = `${BASE_URL}${path}`;
  while (url) {
    const token = import.meta.env.BUTTONDOWN_API_KEY;
    if (!token) throw new Error('BUTTONDOWN_API_KEY is not set');
    const res = await fetch(url, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) throw new Error(`Buttondown API ${res.status}: ${url}`);
    const data = await res.json();
    results.push(...(data.results ?? []));
    url = data.next ?? null;
  }
  return results;
}

export async function getIssues(): Promise<Issue[]> {
  const emails = await fetchAll('/v1/emails?status=sent&page_size=100');

  const issues: Issue[] = emails.map((email: any) => {
    const num = typeof email.secondary_id === 'number' && email.secondary_id > 0
      ? email.secondary_id
      : parseIssueNumber(email.subject ?? '');
    const slug = email.slug ?? email.id;
    const publishDate = email.publish_date ?? email.creation_date;
    return {
      id: email.id ?? '',
      slug,
      number: num,
      title: email.subject ?? '',
      description: email.description ?? '',
      topics: Array.isArray(email.tags) ? email.tags : [],
      publishedAt: publishDate ?? '',
      dateRange: formatDateRange(publishDate),
      weekTag: weekTag(publishDate),
      weekRange: formatWeekRange(publishDate),
      dropDate: formatDropDate(publishDate),
      year: publishDate ? new Date(publishDate).getUTCFullYear().toString() : '',
      permalink: `https://buttondown.com/urban-padel-weekly/archives/${slug}`,
      isLatest: false,
    };
  });

  issues.sort((a, b) => b.number - a.number);
  if (issues.length > 0) issues[0].isLatest = true;

  return issues;
}

/**
 * Like getIssues(), but fills an excerpt (from the issue intro) for any issue
 * whose Buttondown `description` is empty — so archive cards always have crawlable
 * context. Costs one extra body fetch per description-less issue at build time.
 */
export async function getIssuesWithExcerpts(): Promise<Issue[]> {
  const issues = await getIssues();
  await Promise.all(
    issues.map(async (issue) => {
      if (issue.description.trim()) return;
      try {
        const content = await getIssueContent(issue.id);
        const intro = stripHtml(content.introHtml);
        if (intro) issue.description = truncate(intro, 160);
      } catch (e) {
        console.warn(`[buttondown] Could not derive excerpt for ${issue.slug}:`, e);
      }
    })
  );
  return issues;
}

export interface CategorySummary {
  slug: string;
  name: string;
  emoji: string;
  count: number;
}

/** Categories (from story badge labels) that have 2+ substantial stories, newest-weighted. */
export async function getCategoryList(): Promise<CategorySummary[]> {
  const issues = await getIssues();
  const groups = new Map<string, CategorySummary>();
  await Promise.all(
    issues.map(async (issue) => {
      try {
        const { articles } = await getIssueContent(issue.id);
        for (const article of articles) {
          if (!hasStorySubstance(article)) continue;
          const { emoji, name, slug } = parseCategoryLabel(article.categoryLabel);
          if (!slug) continue;
          const g = groups.get(slug);
          if (g) g.count++;
          else groups.set(slug, { slug, name, emoji, count: 1 });
        }
      } catch (e) {
        console.warn(`[buttondown] category scan failed for ${issue.slug}:`, e);
      }
    })
  );
  return Array.from(groups.values())
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count);
}

export async function getIssueBody(id: string): Promise<string> {
  if (!id) return '';
  const data = await apiFetch(`/v1/emails/${id}`);
  return data.body ?? '';
}

export function parseIssueContent(html: string): IssueContent {
  const root = parseHtml(html);
  const allTr = root.querySelectorAll('tr');

  // ── Intro ────────────────────────────────────────────────────────────────
  // The intro row has bg #151515 and padding:36px 24px
  let introHtml = '';
  for (const tr of allTr) {
    const s = tr.querySelector('td')?.getAttribute('style') ?? '';
    if (s.includes('background-color:#151515') && s.includes('padding:36px 24px')) {
      const p = tr.querySelector('p');
      if (p) {
        introHtml = p.innerHTML.trim();
        break;
      }
    }
  }

  // ── Section header rows (D) - padding:48px 24px 16px ────────────────────
  const headerRows = allTr.filter(tr => {
    const s = tr.querySelector('td')?.getAttribute('style') ?? '';
    return s.includes('padding:48px 24px 16px');
  });

  // ── Article content rows (E) - padding:28px 24px 40px + border-bottom ───
  const contentRows = allTr.filter(tr => {
    const s = tr.querySelector('td')?.getAttribute('style') ?? '';
    return s.includes('padding:28px 24px 40px') && s.includes('border-bottom');
  });

  const count = Math.min(headerRows.length, contentRows.length);
  const articles: Article[] = [];

  for (let i = 0; i < count; i++) {
    const hTr = headerRows[i];
    const cTr = contentRows[i];

    // ── Section header ──────────────────────────────────────────────────────
    const number = hTr.querySelector('td[width="120"]')?.text.trim() ?? '';

    const allDivs = hTr.querySelectorAll('div');
    const badge = allDivs.find(d =>
      /background-color:#[0-9a-fA-F]{6}/.test(d.getAttribute('style') ?? '')
    );
    const badgeStyle = badge?.getAttribute('style') ?? '';
    const colorMatch = badgeStyle.match(/background-color:(#[0-9a-fA-F]{6})/);
    const categoryColor = colorMatch?.[1] ?? '#d4ff3a';
    const categoryLabel = badge?.text.trim() ?? '';

    const subtitleDiv = allDivs.find(d =>
      (d.getAttribute('style') ?? '').includes('Courier New') &&
      d.text.trim().startsWith('//')
    );
    const subtitle = subtitleDiv?.text.trim().replace(/^\/\/\s*/, '') ?? '';

    // ── [1] META dateline ───────────────────────────────────────────────────
    const firstDiv = cTr.querySelector('div');
    const spans = firstDiv?.querySelectorAll('span') ?? [];
    const date     = spans.find(s => (s.getAttribute('style') ?? '').includes('#d4ff3a'))?.text.trim() ?? '';
    const location = spans.find(s => (s.getAttribute('style') ?? '').includes('#e8e6df'))?.text.trim() ?? '';
    // Third span (tag label) - plain colour = fog/grey
    const tag = spans.find(s => {
      const st = s.getAttribute('style') ?? '';
      return !st.includes('#d4ff3a') && !st.includes('#e8e6df') && !st.includes('#2a2a2a');
    })?.text.trim() ?? '';

    // ── [2] H2 ─────────────────────────────────────────────────────────────
    const headlineHtml = cTr.querySelector('h2')?.innerHTML ?? '';

    // ── Classify all <table> children ──────────────────────────────────────
    const tables = cTr.querySelectorAll('table');

    // [4] STATS GRID - bg:#1e1e1e + acid border - NO acid-bg header cell
    let stats: StatCell[] = [];
    const statsTable = tables.find(t => {
      const s = t.getAttribute('style') ?? '';
      if (!s.includes('background-color:#1e1e1e') || !s.includes('border:1px solid #d4ff3a')) return false;
      // Distinguish from ranking board: ranking board has a td with acid background as header
      const hasAcidHeader = !!t.querySelector('td[style*="background-color:#d4ff3a"]');
      return !hasAcidHeader;
    });
    if (statsTable) {
      // Use td[width*="%"] to match the 33%/34% stat cells, not any rank-position cell
      const cells = statsTable.querySelectorAll('td[width]').filter(td =>
        (td.getAttribute('width') ?? '').includes('%')
      );
      stats = cells.map(td => {
        const divs = td.querySelectorAll('div');
        const valDiv = divs[0];
        const labelDiv = divs[1];
        // Value may be wrapped in a <span> for colour - .text still captures it
        const rawVal = valDiv?.text.trim() ?? '';
        const vs = valDiv?.innerHTML ?? '';
        const color: StatCell['color'] = vs.includes('#d4ff3a') ? 'acid'
          : vs.includes('#ff2e6a') ? 'magenta' : 'white';
        return { value: rawVal, label: labelDiv?.text.trim() ?? '', color };
      });
    }

    // [5] RANKING BOARD - bg:#1e1e1e + acid border + acid-bg header cell
    let rankingBoard: RankingBoard | null = null;
    const boardTable = tables.find(t => {
      const s = t.getAttribute('style') ?? '';
      return s.includes('background-color:#1e1e1e') &&
             s.includes('border:1px solid #d4ff3a') &&
             !!t.querySelector('td[style*="background-color:#d4ff3a"]');
    });
    if (boardTable) {
      const headerTd = boardTable.querySelector('td[style*="background-color:#d4ff3a"]');
      const headerTds = headerTd?.querySelectorAll('td') ?? [];
      const title   = headerTds[0]?.text.trim() ?? headerTd?.text.trim() ?? '';
      const context = headerTds[1]?.text.trim() ?? '';

      const rows: RankRow[] = [];
      // Rank rows: each inner <table> after the header contains one row.
      // Guard: first cell must be a bracketed rank like [01] - skips the header's inner table.
      const innerTables = boardTable.querySelectorAll('table');
      for (const rt of innerTables) {
        const tds = rt.querySelectorAll('td');
        if (tds.length < 2) continue;
        const rawRank = tds[0]?.text.trim();
        if (!/^\[\d+\]$/.test(rawRank)) continue;
        const rank = rawRank.replace(/[\[\]]/g, '');
        const team = tds[1]?.text.trim();
        const city = tds[2]?.text.trim() ?? '';
        if (team) rows.push({ rank, team, city });
      }
      rankingBoard = { title, context, rows };
    }

    // [6] CALLOUT - dashed acid border + dark green bg
    let callout: Callout | null = null;
    const calloutTable = tables.find(t => {
      const s = t.getAttribute('style') ?? '';
      return s.includes('border:2px dashed #d4ff3a') && s.includes('background-color:#141a08');
    });
    if (calloutTable) {
      const td = calloutTable.querySelector('td');
      const labelSpan = td?.querySelector('span[style*="background-color:#d4ff3a"]');
      const label = labelSpan?.text.trim() ?? '';
      // Text is everything after the label span
      const fullText = td?.text ?? '';
      const text = fullText.replace(label, '').trim();
      callout = { label, text };
    }

    // [7] PULL QUOTE - magenta bg table
    let quote = '';
    let quoteAuthor = '';
    const quoteTable = tables.find(t =>
      (t.getAttribute('style') ?? '').includes('background-color:#ff2e6a')
    );
    if (quoteTable) {
      const qdivs = quoteTable.querySelectorAll('div');
      quote = qdivs.find(d => (d.getAttribute('style') ?? '').includes('font-size:22px'))?.text.trim() ?? '';
      quoteAuthor = qdivs.find(d => (d.getAttribute('style') ?? '').includes('opacity:0.75'))?.text.trim().replace(/^-\s*/, '') ?? '';
    }

    // [8] LEDE paragraph - Helvetica font
    const bodyP = cTr.querySelectorAll('p').find(p =>
      (p.getAttribute('style') ?? '').includes('Helvetica')
    );
    const bodyHtml = bodyP?.innerHTML ?? '';

    // [9] LINKS - primary CTA button
    const readMoreUrl = cTr.querySelector('a[href]')?.getAttribute('href') ?? '';

    articles.push({
      number, categoryColor, categoryLabel, subtitle,
      date, location, tag,
      headlineHtml, stats, rankingBoard, callout,
      quote, quoteAuthor, bodyHtml, readMoreUrl,
    });
  }

  return { introHtml, articles };
}

export async function getIssueContent(id: string): Promise<IssueContent> {
  const body = await getIssueBody(id);
  if (!body) return { introHtml: '', articles: [] };
  return parseIssueContent(body);
}

export async function getSubscriberCount(): Promise<number> {
  const data = await apiFetch('/v1/subscribers?type=regular&page_size=1');
  return data.count ?? 0;
}
