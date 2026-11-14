(() => {
  const list = document.getElementById('note-articles');
  const status = document.getElementById('note-status');
  if (!list || !status) return;
  const profile = 'https://note.com/adult_curiosity';
  let sequence = 0;
  const safeURL = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'note.com' && !url.username && !url.password && !url.port && /^\/adult_curiosity\/n\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) ? url.href : null; } catch { return null; }
  };
  function link(url, label, className) {
    const a = document.createElement('a'); a.href = url; a.textContent = label; a.className = className; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
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
        const url = safeURL(item.url);
        if (!url || typeof item.title !== 'string' || !item.title.trim()) continue;
        const card = document.createElement('article'); card.className = 'note-card';
        if (item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))) {
          const date = document.createElement('time'); date.dateTime = item.publishedAt; date.textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(new Date(item.publishedAt)); card.append(date);
        }
        const heading = document.createElement('h3'); heading.append(link(url, item.title, 'note-title-link')); card.append(heading);
        if (typeof item.excerpt === 'string' && item.excerpt.trim()) { const text = document.createElement('p'); text.className = 'note-excerpt'; text.textContent = item.excerpt; card.append(text); }
        const more = link(url, '続きを読む ↗', 'note-read-more'); more.setAttribute('aria-label', item.title + '（noteで続きを読む）'); card.append(more); cards.push(card);
      }
      list.replaceChildren(...cards);
      status.textContent = cards.length ? (data.stale ? '新しい記事はnoteでもご覧いただけます。' : '') : '記事の公開を準備しています。noteのページもご覧ください。';
      status.hidden = cards.length > 0 && !data.stale;
    } catch {
      if (current === sequence) { status.hidden = false; status.textContent = '最新の記事は、下の「noteの記事をすべて見る」からご覧ください。'; }
    } finally { clearTimeout(timer); }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
