export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing GitHub authorization code.', { status: 400 });

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = await response.json();
  if (!data.access_token) return new Response('GitHub authorization failed.', { status: 401 });

  const origin = url.origin;
  const authorization = `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`;
  const document = `<!doctype html>
    <html><head><meta charset="utf-8"><title>正在完成登录…</title></head>
    <body><p>正在完成登录…</p><script>
      (() => {
        const origin = ${JSON.stringify(origin)};
        const authorization = ${JSON.stringify(authorization).replace(/</g, '\\u003c')};
        const complete = (event) => {
          if (event.origin !== origin || !window.opener) return;
          window.opener.postMessage(authorization, event.origin);
          window.close();
        };
        if (window.opener) {
          window.addEventListener('message', complete, false);
          window.opener.postMessage('authorizing:github', origin);
        }
      })();
    </script></body></html>`;

  return new Response(document, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}
