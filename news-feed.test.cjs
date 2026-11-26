const assert = require('node:assert/strict');
const test = require('node:test');
const { createWorldNews, newsArticleUrl } = require('./news-feed.cjs');

test('football feed uses the BBC endpoint and shares one fetch across callers', async () => {
  const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Football</title></channel></rss>';
  let calls = 0;
  const read = createWorldNews(async (url, options) => {
    calls++;
    assert.equal(url, 'https://feeds.bbci.co.uk/sport/football/rss.xml');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  });
  const first = read();
  const second = read();
  assert.equal(first, second);
  assert.deepEqual(await first, { xml, source: 'BBC Sport' });
  assert.deepEqual(await read(), await first);
  assert.equal(calls, 1);
});

test('football feed rejects oversized streaming responses and caches a network failure briefly', async () => {
  let signal;
  let calls = 0;
  const read = createWorldNews(async (_url, options) => {
    signal = options.signal;
    calls++;
    return new Response(new Uint8Array(600_000), { headers: { 'Content-Type': 'application/rss+xml' } });
  });
  const result = await read();
  assert.equal(result.source, 'BBC Sport');
  assert.ok(result.error);
  assert.equal(result.xml, undefined);
  assert.equal(signal.aborted, true);
  assert.deepEqual(await read(), result);
  assert.equal(calls, 1);
});

test('only BBC HTTPS article URLs can leave the desktop companion', () => {
  for (const path of ['https://www.bbc.co.uk/sport/articles/example', 'https://bbc.com/sport/articles/example']) {
    assert.equal(newsArticleUrl(path), path);
  }
  for (const path of [
    'http://www.bbc.com/sport', 'https://www.bbc.com.example.org/sport', 'https://notbbc.com/sport',
    'https://www.bbc.com:443/sport', 'https://www.bbc.com:8443/sport', 'https://person@www.bbc.com/sport',
    'https://bbc.com\\@example.org/sport', 'https://www.bbci.co.uk/sport', 'steam://run/3405690',
  ]) assert.equal(newsArticleUrl(path), null, path);
});
