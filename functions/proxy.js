// functions/proxy.js
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  if (!targetUrl) {
    return new Response('Missing target URL parameter', { status: 400 });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const response = await fetch(parsedTarget.toString(), {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      },
      redirect: 'follow'
    });

    const contentType = response.headers.get('content-type') || '';
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Expose-Headers', '*');
    newHeaders.delete('Content-Security-Policy');

    // If it's an MPD manifest, inject a BaseURL or rewrite relative segment paths to route through this proxy
    if (targetUrl.includes('.mpd') || contentType.includes('dash+xml') || contentType.includes('xml')) {
      let mpdText = await response.text();
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const proxyBase = `${url.origin}/proxy?base=${encodeURIComponent(basePath)}&seg=`;

      // Inject BaseURL right after the opening <MPD ...> or <Period ...> tag if not present
      if (!mpdText.includes('<BaseURL>')) {
        mpdText = mpdText.replace(/(<MPD[^>]*>)/i, `$1\n<BaseURL>${proxyBase.replace(/&/g, '&amp;')}</BaseURL>`);
      }
      return new Response(mpdText, {
        status: response.status,
        headers: newHeaders
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });
  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
