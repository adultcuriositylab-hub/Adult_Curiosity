"""Check generated article links and content editing without changing source files."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('article_builder', ROOT / 'scripts/build_articles.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def digest(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts}

with tempfile.TemporaryDirectory() as folder:
    working = Path(folder) / 'site'
    shutil.copytree(ROOT, working, ignore=shutil.ignore_patterns('__pycache__'))
    before = digest(working)
    module.build(working)
    assert digest(working) == before, 'Rebuild must be deterministic'
    data = json.loads((working / 'content/articles.json').read_text())
    slugs = [a['slug'] for c in data['categories'] for a in c['articles']]
    assert len(slugs) == 18 and len(set(slugs)) == 18
    home = (working / 'index.html').read_text()
    for category in data['categories']:
        assert category['title'] in home
        for article in category['articles']:
            assert f'href="articles/{article["slug"]}/"' in home
            page = (working / 'articles' / article['slug'] / 'index.html').read_text()
            assert article['title'] in page
            assert 'noindex,follow' in page
    first = data['categories'][0]['articles'][0]
    (working / 'content/articles' / (first['slug'] + '.txt')).write_text('編集した本文です。\n\n<script>unsafe()</script>')
    first['status'] = 'published'
    data['categories'][0]['articles'].append({'slug': 'new-topic', 'title': '追加した記事', 'status': 'preparing'})
    (working / 'content/articles/new-topic.txt').write_text('新しい本文です。')
    (working / 'content/articles.json').write_text(json.dumps(data, ensure_ascii=False))
    module.build(working)
    updated = (working / 'articles' / first['slug'] / 'index.html').read_text()
    assert '編集した本文です。' in updated and '<script>unsafe()' not in updated
    assert '&lt;script&gt;' in updated and 'noindex,follow' not in updated
    assert 'href="articles/new-topic/"' in (working / 'index.html').read_text()
    assert '新しい本文です。' in (working / 'articles/new-topic/index.html').read_text()
    data['categories'][0]['articles'].append(dict(first))
    (working / 'content/articles.json').write_text(json.dumps(data, ensure_ascii=False))
    try:
        module.build(working)
    except ValueError:
        pass
    else:
        raise AssertionError('Duplicate URL slug must be rejected')
print('Passed: 18 pages, unique links, deterministic builds, body editing, article addition, status changes, escaping, duplicate rejection.')
