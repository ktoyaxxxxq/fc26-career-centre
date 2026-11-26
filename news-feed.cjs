const feedUrl = 'https://feeds.bbci.co.uk/sport/football/rss.xml';
const source = 'BBC Sport';
const maxFeedBytes = 512 * 1024;
const freshFor = 10 * 60_000;
const retryAfter = 30_000;

async function fetchFeed(fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(feedUrl, { credentials: 'omit', redirect: 'error', signal: controller.signal });
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!response.ok || !response.body || !['text/xml', 'application/xml', 'application/rss+xml'].includes(type) ||
        Number(response.headers.get('content-length')) > maxFeedBytes) throw new Error('Invalid football feed response');
    const decoder = new TextDecoder();
    let size = 0;
    let xml = '';
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxFeedBytes) throw new Error('Football feed is too large');
      xml += decoder.decode(chunk, { stream: true });
    }
    xml += decoder.decode();
    if (!/<rss[\s>]/i.test(xml) || /<!DOCTYPE/i.test(xml)) throw new Error('Invalid RSS document');
    return { xml, source };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function createWorldNews(fetch) {
  let cached;
  let expiresAt = 0;
  let inFlight;
  return function readWorldNews() {
    if (Date.now() < expiresAt) return Promise.resolve(cached);
    inFlight ??= fetchFeed(fetch)
      .catch(() => ({ source, error: 'Не удалось загрузить новости BBC Sport.' }))
      .then(news => {
        cached = news;
        expiresAt = Date.now() + (news.error ? retryAfter : freshFor);
        return news;
      })
      .finally(() => { inFlight = undefined; });
    return inFlight;
  };
}

function newsArticleUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!/^(?:[a-z0-9-]+\.)*bbc\.(?:com|co\.uk)$/i.test(authority ?? '')) return null;
  return URL.parse(value)?.href ?? null;
}

module.exports = { createWorldNews, newsArticleUrl };
