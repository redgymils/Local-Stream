export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    if (url.pathname === '/proxy') {
      let targetUrl = url.searchParams.get('url');
      const base = url.searchParams.get('base');
      const seg = url.searchParams.get('seg');

      if (!targetUrl && base) {
        targetUrl = base + (seg || '');
      }

      if (!targetUrl) {
        return new Response('Missing target URL parameter', { status: 400 });
      }

      try {
        let currentUrl = targetUrl;
        let response;

        // Follow up to 3 ZTE IPTV 302 redirects manually to capture the final edge IP path
        for (let i = 0; i < 3; i++) {
          response = await fetch(currentUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Lavf/58.76.100',
              'Accept': '*/*'
            },
            redirect: 'manual'
          });

          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location) {
              currentUrl = new URL(location, currentUrl).toString();
              continue;
            }
          }
          break;
        }

        const contentType = response.headers.get('content-type') || '';
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Expose-Headers', '*');
        newHeaders.delete('Content-Security-Policy');

        if (currentUrl.includes('.mpd') || contentType.includes('dash+xml') || contentType.includes('xml')) {
          let mpdText = await response.text();
          const cleanUrl = currentUrl.split('?')[0];
          const basePath = cleanUrl.substring(0, cleanUrl.lastIndexOf('/') + 1);
          const proxyBase = `${url.origin}/proxy?base=${encodeURIComponent(basePath)}&seg=`;

          if (mpdText.includes('<BaseURL>')) {
            mpdText = mpdText.replace(/<BaseURL>.*?<\/BaseURL>/gi, `<BaseURL>${proxyBase.replace(/&/g, '&amp;')}</BaseURL>`);
          } else {
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
        return new Response(JSON.stringify({
          error: 'Cloudflare Workers blocks outbound port 6610 on raw IPs.',
          details: err.message
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
