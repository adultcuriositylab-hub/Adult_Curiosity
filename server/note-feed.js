import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decode } from 'html-entities';

export const PROFILE_URL = 'https://note.com/adult_curiosity';
export const FEED_URL = PROFILE_URL + '/rss';
export const FEED_LIMIT = 3;
const FRESH_MS = 5 * 60 * 1000;
const MAX_BYTES = 1024 * 1024;
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: true });

function string(value) { return typeof value === 'string' ? value : ''; }
function plainText(value) {
  return decode(string(value).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:p|div|li|h[1-6]|blockquote)\b[^>]*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ''), { level: 'html5' })
    .replace(/\r/g, '').replace(/[\t \u00a0]+/g, ' ').trim();
}
function excerpt(description, title) {
  const text = plainText(description).split(/\n+/).map(x => x.trim()).filter(x => x && x !== title && !/^(?:続きをみる|続きを読む|もっとみる)$/.test(x)).join(' ')
    .replace(/\s*(?:続きをみる|続きを読む)\s*$/, '').trim();
  const boundary = text.match(/[。！？!?][」』）)]*/u);
  const sentence = boundary ? text.slice(0, boundary.index + boundary[0].length) : text;
  const chars = Array.from(sentence);
  return chars.length > 120 ? chars.slice(0, 120).join('') + '…' : sentence;
}
function safeArticleURL(value) {
  try {
    const url = new URL(string(value));
    if (url.protocol !== 'https:' || url.hostname !== 'note.com' || url.username || url.password || url.port ||
        !/^\/adult_curiosity\/n\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch { return null; }
}

export function parseNoteFeed(xml) {
  if (typeof xml !== 'string' || new TextEncoder().encode(xml).byteLength > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid feed');
  const feed = parser.parse(xml);
  if (!feed?.rss?.channel) throw new Error('Missing RSS channel');
  const raw = feed.rss.channel.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  const articles = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const url = safeArticleURL(item.link);
    const title = plainText(item.title).replace(/\s+/g, ' ').trim();
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const date = Date.parse(string(item.pubDate));
    articles.push({ title: Array.from(title).slice(0, 300).join(''), url,
      excerpt: excerpt(item.description || item['content:encoded'], title),
      publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null });
  }
  articles.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  return articles.slice(0, FEED_LIMIT);
}

async function boundedText(response) {
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Feed too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('Feed too large'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
  } });
}

export function createNoteHandler({ fetchImpl = fetch, cache, now = () => Date.now() } = {}) {
  let inFlight;
  let runtimeCache = cache;
  async function refresh(cacheKey) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetchImpl(FEED_URL, { signal: controller.signal, headers: { accept: 'application/rss+xml, application/xml, text/xml' }, redirect: 'follow' });
        if (!response.ok) throw new Error('Feed request failed');
        const data = { profileUrl: PROFILE_URL, articles: parseNoteFeed(await boundedText(response)), fetchedAt: new Date(now()).toISOString(), stale: false };
        if (runtimeCache) {
          try { await runtimeCache.put(cacheKey, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })); } catch { /* An unavailable cache must not hide a valid feed. */ }
        }
        return data;
      } finally { clearTimeout(timer); }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  }
  return async function ({ request, waitUntil }) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    const cacheKey = new Request(new URL('/api/note-feed-cache-v1', request.url));
    let cached;
    try {
      if (!runtimeCache) runtimeCache = globalThis.caches?.default;
      const response = runtimeCache && await runtimeCache.match(cacheKey);
      if (response) {
        const candidate = await response.json();
        if (candidate.profileUrl === PROFILE_URL && Array.isArray(candidate.articles) && Number.isFinite(Date.parse(candidate.fetchedAt))) cached = candidate;
      }
    } catch { /* Fetch the feed if the cache cannot be read. */ }
    let response;
    const age = cached ? now() - Date.parse(cached.fetchedAt) : Infinity;
    if (cached && age >= 0 && age < FRESH_MS) response = json(cached);
    else if (cached && age >= 0 && age < 86400000) {
      const work = refresh(cacheKey).catch(() => {});
      if (waitUntil) waitUntil(work); else await work;
      response = json({ ...cached, stale: true });
    } else {
      try { response = json(await refresh(cacheKey)); }
      catch { response = json({ profileUrl: PROFILE_URL, articles: [], unavailable: true }, 503); response.headers.set('retry-after', '60'); }
    }
    return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  };
}
