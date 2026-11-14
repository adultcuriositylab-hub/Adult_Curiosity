(() => {
  const list = document.getElementById('note-articles');
  const status = document.getElementById('note-status');
  if (!list || !status) return;
  const profile = 'https://note.com/adult_curiosity';
  let sequence = 0;
  const safeURL = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'note.com' && !url.username && !url.password && !url.port && /^\/adult_curiosity\/n\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) ? url.href : null; } catch { return null; }
  };
  function element(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text) el.textContent = text; return el; }
  function link(url, label, className) { const a = element('a', className, label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function dateFor(item) {
    if (!item.publishedAt || !Number.isFinite(Date.parse(item.publishedAt))) return null;
    const time = element('time', 'note-date', new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(item.publishedAt)).replaceAll('-', '.'));
    time.dateTime = item.publishedAt; return time;
  }
  function featured(item, url) {
    const card = element('article', 'note-card note-featured');
    const meta = element('div', 'note-featured-meta'); meta.append(element('span', 'note-new-label', 'NEW ARTICLE'));
    const date = dateFor(item); if (date) meta.append(date); card.append(meta);
    const paper = element('div', 'note-featured-paper');
    const heading = element('h3', 'note-featured-title'); const titleLink = link(url, item.title, 'note-title-link'); titleLink.setAttribute('aria-label', item.title); heading.append(titleLink); paper.append(heading);
    if (typeof item.excerpt === 'string' && item.excerpt.trim()) paper.append(element('p', 'note-excerpt', item.excerpt));
    card.append(paper);
    const more = link(url, '', 'note-read-more note-featured-more');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'note-book-icon'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.7'); icon.setAttribute('aria-hidden', 'true');
    const bookPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); bookPath.setAttribute('d', 'M12 7v14M3 5c3-1 6-.5 9 1.5C15 4.5 18 4 21 5v14c-3-1-6-.5-9 1.5C9 18.5 6 18 3 19V5Z'); icon.append(bookPath);
    const arrow = element('span', 'note-link-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
    more.append(icon, element('span', '', 'noteで記事を読む'), arrow); more.setAttribute('aria-label', item.title + '（noteで記事を読む）'); card.append(more);
    return card;
  }
  function compact(item, url, rank) {
    const card = element('article', 'note-card note-compact');
    const cover = element('div', 'note-mini-cover'); cover.setAttribute('aria-hidden', 'true'); cover.append(element('span', 'note-mini-label', 'NOTE'), element('span', 'note-mini-number', String(rank).padStart(2, '0')), element('span', 'note-mini-icon', '🧪')); card.append(cover);
    const content = element('div', 'note-compact-content'); const date = dateFor(item); if (date) content.append(date);
    const heading = element('h3', 'note-compact-title'); heading.append(link(url, item.title, 'note-title-link')); content.append(heading);
    if (typeof item.excerpt === 'string' && item.excerpt.trim()) content.append(element('p', 'note-excerpt', item.excerpt));
    const more = link(url, '記事を読む ↗', 'note-read-more note-compact-more'); more.setAttribute('aria-label', item.title + '（noteで記事を読む）'); content.append(more); card.append(content);
    return card;
  }
  async function load() {
    const current = ++sequence;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/note', { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (data.profileUrl !== profile || !Array.isArray(data.articles)) throw new Error('Invalid response');
      if (current !== sequence) return;
      const cards = [];
      for (const item of data.articles.slice(0, 3)) {
        const url = item && safeURL(item.url);
        if (!url || typeof item.title !== 'string' || !item.title.trim()) continue;
        cards.push(cards.length === 0 ? featured(item, url) : compact(item, url, cards.length + 1));
      }
      list.replaceChildren(...cards);
      status.hidden = cards.length > 0 && !data.stale;
      if (!status.hidden) status.replaceChildren(document.createTextNode(cards.length ? '新しい記事はnoteでご覧いただけます。 ' : '記事の公開を準備しています。 '), link(profile, 'noteで記事を見る ↗', 'note-fallback-link'));
      else status.replaceChildren();
    } catch {
      if (current === sequence) { status.hidden = false; status.replaceChildren(document.createTextNode('最新の記事はnoteからご覧ください。 '), link(profile, 'noteで記事を見る ↗', 'note-fallback-link')); }
    } finally { clearTimeout(timer); }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
