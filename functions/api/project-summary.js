const OWNER = 'lionchain100-alt';
const MAX_README_CHARS = 16000;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function cleanSummary(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function parseModelResponse(result) {
  const raw = typeof result === 'string' ? result : result?.response || '';
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型未返回可用的结构化结果');
  const parsed = JSON.parse(match[0]);
  return {
    summaryZh: cleanSummary(parsed.summaryZh, 180),
    summaryEn: cleanSummary(parsed.summaryEn, 260),
    contextZh: cleanSummary(parsed.contextZh, 260),
    contextEn: cleanSummary(parsed.contextEn, 360),
  };
}

export async function onRequestPost({ request, env }) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: '需要 GitHub 登录后才能生成简介。' }, { status: 401 });

  const identity = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'laconicleon-site' },
  });
  if (!identity.ok) return json({ error: 'GitHub 登录已失效，请重新登录后台。' }, { status: 401 });
  const user = await identity.json();
  if (user.login !== OWNER) return json({ error: '此功能仅允许网站所有者使用。' }, { status: 403 });
  if (!env.AI) return json({ error: 'AI 服务尚未启用，请在 Cloudflare Pages 的生产环境添加名为 AI 的 Workers AI 绑定后重新部署。' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式无效。' }, { status: 400 }); }
  const repository = cleanSummary(body.repository, 120);
  const readme = String(body.readme || '').slice(0, MAX_README_CHARS);
  if (!repository || !readme.trim()) return json({ error: '需要项目名和 README 内容。' }, { status: 400 });

  try {
    const instruction = 'Write concise, factual portfolio copy from a repository README. Return exactly one JSON object with four non-empty string values: {"summaryZh":"short Chinese label","summaryEn":"short English label","contextZh":"Chinese explanation","contextEn":"English explanation"}. Do not output markdown, explanations, placeholders, or ellipses. Omit secrets, URLs, installation commands, implementation minutiae, and claims not supported by the README. summaryZh: at most 36 Chinese characters. summaryEn: at most 80 characters. contextZh: at most 110 Chinese characters. contextEn: at most 180 characters. If the README is sparse, state only what it supports.';
    const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      raw: true,
      max_tokens: 380,
      temperature: 0.2,
      prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${instruction}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nRepository: ${repository}\n\nREADME:\n${readme}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`,
    });
    const summaries = parseModelResponse(result);
    if (!summaries.summaryZh || !summaries.summaryEn || !summaries.contextZh || !summaries.contextEn) throw new Error('项目档案不完整');
    return json(summaries);
  } catch (error) {
    console.error('Project summary generation failed', error instanceof Error ? error.message : 'unknown error');
    return json({ error: '简介生成暂时失败，请稍后重试或手动填写。' }, { status: 502 });
  }
}
