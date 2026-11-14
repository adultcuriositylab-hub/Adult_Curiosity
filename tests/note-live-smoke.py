"""Read-only live check after Cloudflare deploy; never posts or modifies note."""
import json
import time
import urllib.request
from urllib.parse import urlparse

url = 'https://adult-curiosity.pages.dev/api/note'
last_error = 'deployment has not finished'
for attempt in range(12):
    try:
        request = urllib.request.Request(url, headers={'Accept': '*/*', 'Cache-Control': 'no-cache', 'User-Agent': 'AdultCuriosityLab-FeedCheck/1.0'})
        with urllib.request.urlopen(request, timeout=15) as response:
            assert response.status == 200
            assert 'application/json' in response.headers.get('Content-Type', '')
            data = json.load(response)
        assert data['profileUrl'] == 'https://note.com/adult_curiosity'
        assert isinstance(data['articles'], list) and len(data['articles']) <= 3
        assert data.get('fetchedAt') and not data.get('unavailable')
        for article in data['articles']:
            parsed = urlparse(article['url'])
            assert parsed.scheme == 'https' and parsed.netloc == 'note.com'
            assert parsed.path.startswith('/adult_curiosity/n/')
            assert article['title'].strip()
            assert isinstance(article['excerpt'], str) and len(article['excerpt']) <= 121
        print('Live note API verified:', len(data['articles']), 'articles; fetchedAt:', data['fetchedAt'])
        break
    except Exception as error:
        last_error = str(error)
        print('Waiting for deployed note endpoint:', type(error).__name__, last_error[:160], flush=True)
        time.sleep(5)
else:
    raise SystemExit('Live verification failed: ' + last_error)
