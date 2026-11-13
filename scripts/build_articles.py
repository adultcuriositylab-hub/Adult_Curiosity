#!/usr/bin/env python3
"""Generate topic links and article HTML from a JSON catalog and plain-text bodies. No dependencies."""
import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START = '<!-- BEGIN TOPIC ARTICLES -->'
END = '<!-- END TOPIC ARTICLES -->'

def esc(value):
    return html.escape(value, quote=True)

def build(root=ROOT):
    catalog = json.loads((root / 'content/articles.json').read_text(encoding='utf-8'))
    categories = catalog['categories']
    ids, slugs = set(), set()
    for category in categories:
        ident = category['id']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', ident) or ident in ids:
            raise ValueError('Invalid or duplicate category id: ' + ident)
        ids.add(ident)
        for article in category['articles']:
            slug = article['slug']
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or slug in slugs:
                raise ValueError('Invalid or duplicate article slug: ' + slug)
            slugs.add(slug)
            if article.get('status', 'preparing') not in ('preparing', 'published'):
                raise ValueError('Invalid article status: ' + slug)
            body = (root / 'content/articles' / (slug + '.txt')).read_text(encoding='utf-8').strip()
            if not body:
                raise ValueError('Empty article body: ' + slug)
    rows = []
    for category in categories:
        links = '\n'.join(
            '<li><a href="articles/{slug}/"><span>{title}</span><span class="topic-link-arrow" aria-hidden="true">↗</span></a></li>'.format(
                slug=esc(a['slug']), title=esc(a['title'])) for a in category['articles'])
        rows.append('''<li><details class="topic-accordion" id="topic-{id}">
<summary><span>{title}</span><span class="topic-chevron" aria-hidden="true"></span></summary>
<ul class="topic-links">{links}</ul>
</details></li>'''.format(id=esc(category['id']), title=esc(category['title']), links=links))
    region = START + '\n<ul id="topics-accordion" aria-label="相談カテゴリーと記事">\n' + '\n'.join(rows) + '\n</ul>\n' + END
    home_path = root / 'index.html'
    home = home_path.read_text(encoding='utf-8')
    if START in home and END in home:
        home = home[:home.index(START)] + region + home[home.index(END) + len(END):]
    else:
        pattern = r'<ul class="grid gap-3 sm:grid-cols-2">\s*<li data-template-id="topic-one"[\s\S]*?</ul>'
        home, count = re.subn(pattern, lambda _: region, home, count=1)
        if count != 1:
            raise ValueError('Expected topic region was not found; refusing to change other sections')
    stylesheet = '<link rel="stylesheet" href="assets/topics.css">'
    if stylesheet not in home:
        home = home.replace('</head>', stylesheet + '\n</head>', 1)
    home_path.write_text(home, encoding='utf-8')
    article_count = 0
    for category in categories:
        for article in category['articles']:
            slug, title = article['slug'], article['title']
            preparing = article.get('status', 'preparing') == 'preparing'
            body = (root / 'content/articles' / (slug + '.txt')).read_text(encoding='utf-8').strip()
            headings = set(article.get('bodyHeadings', []))
            subheadings = set(article.get('bodySubheadings', []))
            blocks = []
            for paragraph in re.split(r'\n\s*\n', body):
                if paragraph in headings:
                    blocks.append('<h2>' + esc(paragraph) + '</h2>')
                elif paragraph in subheadings:
                    blocks.append('<h3>' + esc(paragraph) + '</h3>')
                elif all(line.startswith('* ') for line in paragraph.splitlines()):
                    blocks.append('<ul>' + ''.join('<li>' + esc(line[2:]) + '</li>' for line in paragraph.splitlines()) + '</ul>')
                else:
                    blocks.append('<p>' + esc(paragraph).replace('\n', '<br>') + '</p>')
            paragraphs = '\n'.join(blocks)
            robots = '<meta name="robots" content="noindex,follow">' if preparing else ''
            label = '<p class="article-status">ただいま準備中です</p>' if preparing else ''
            output = f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{esc(title)}｜大人の自由研究所</title>
<meta name="description" content="{esc(title)}。大人の自由研究所の{esc(category['title'])}の記事です。{'本文は準備中です。' if preparing else ''}">
{robots}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/articles.css">
</head>
<body>
<header class="article-header"><a class="article-brand" href="../../index.html">大人の自由研究所</a></header>
<main class="article-shell"><article class="article-card">
<p class="article-category"><a href="../../index.html#topic-{esc(category['id'])}">{esc(category['title'])}</a></p>
<h1>{esc(title)}</h1>
{label}
<div class="article-body">{paragraphs}</div>
<nav class="article-navigation" aria-label="記事から戻る"><a href="../../index.html#topic-{esc(category['id'])}">カテゴリーに戻る</a><a href="../../index.html">トップページへ</a></nav>
</article></main>
<footer class="article-footer">© 大人の自由研究所</footer>
</body></html>
'''
            dest = root / 'articles' / slug / 'index.html'
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(output, encoding='utf-8')
            article_count += 1
    print(f'Built {len(categories)} categories and {article_count} article pages.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    build(parser.parse_args().root)
