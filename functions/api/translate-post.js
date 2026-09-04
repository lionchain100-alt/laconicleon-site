const OWNER = 'lionchain100-alt';
const MAX_BODY_CHARS = 26000;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function modelText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  const choice = result?.choices?.[0];
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  if (typeof choice?.text === 'string') return choice.text;
  return '';
}

function parseMetadata(result) {
  const raw = modelText(result) || result?.response || '';
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const tags = Array.isArray(raw.tags) ? raw.tags.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 8) : [];
    return { title: clean(raw.title, 180), description: clean(raw.description, 360), tags };
  }
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型未返回可用的翻译元数据');
  const translated = JSON.parse(match[0]);
  const tags = Array.isArray(translated.tags) ? translated.tags.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 8) : [];
  return {
    title: clean(translated.title, 180),
    description: clean(translated.description, 360),
    tags,
  };
}

function parseTranslation(result) {
  const raw = result?.response ?? result;
  const parsed = typeof raw === 'string' ? JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '') : raw;
  const tags = Array.isArray(parsed?.tags) ? parsed.tags.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 8) : [];
  return { title: clean(parsed?.title, 180), description: clean(parsed?.description, 360), tags, body: clean(parsed?.body, 40000) };
}

function cleanMarkdown(result) {
  const raw = modelText(result);
  return clean(String(raw).replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/, ''), 40000);
}

export async function onRequestPost({ request, env }) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: '需要 GitHub 登录后才能生成翻译草稿。' }, { status: 401 });

  const identity = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'laconicleon-site' },
  });
  if (!identity.ok) return json({ error: 'GitHub 登录已失效，请重新登录后台。' }, { status: 401 });
  const user = await identity.json();
  if (user.login !== OWNER) return json({ error: '此功能仅允许网站所有者使用。' }, { status: 403 });
  if (!env.AI) return json({ error: 'AI 服务尚未启用。' }, { status: 503 });

  let input;
  try { input = await request.json(); } catch { return json({ error: '请求格式无效。' }, { status: 400 }); }
  const title = clean(input.title, 220);
  const description = clean(input.description, 600);
  const body = clean(input.body, MAX_BODY_CHARS);
  if (!title || !description || !body) return json({ error: '文章标题、摘要和正文不能为空。' }, { status: 400 });

  try {
    const instruction = 'You are an experienced Chinese nonfiction editor writing for laconicleon, a personal site with a calm, precise voice. Adapt the supplied English Markdown article into a fluent standalone Simplified Chinese essay. Do not translate sentence by sentence: split or merge sentences, change clause order, and rebuild transitions when that reads better in Chinese. Preserve the author\'s first-person voice when present. Preserve every Markdown heading, list, link, inline code, code block, number, currency, percentage, equation, warning, and factual claim. Do not invent examples, sources, claims, or a stronger conclusion. Avoid translationese and AI habits: unnecessary “此外/然而/通过…实现”, overblown praise, “不仅…而且…”, slogan-like endings, repeated three-part lists, and excessive em dashes. Prefer direct verbs, concrete nouns, varied sentence rhythm, and restrained wording. Return exactly one JSON object: {"title":"natural Chinese title","description":"natural Chinese description","tags":["Chinese tag"],"body":"publication-ready Chinese Markdown"}. No YAML frontmatter, commentary, placeholders, or ellipses.';
    const result = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
      max_tokens: 4096,
      temperature: 0.35,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: instruction }, { role: 'user', content: `TITLE:\n${title}\n\nDESCRIPTION:\n${description}\n\nARTICLE:\n${body}` }],
      response_format: { type: 'json_object' },
    });
    const translated = parseTranslation(result);
    if (!translated.title || !translated.description || !translated.body || translated.body.length < 20) throw new Error('中文成稿不完整');
    return json(translated);
  } catch (error) {
    console.error('Post translation failed', error instanceof Error ? error.message : 'unknown error');
    return json({ error: '中文草稿生成失败，请稍后重试。' }, { status: 502 });
  }
}
