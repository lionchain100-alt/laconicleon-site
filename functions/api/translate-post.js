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
    const metadataInstruction = 'You are the Chinese editor for a thoughtful personal website. Adapt this English title and description into idiomatic, restrained Simplified Chinese. Do not translate word by word. Preserve facts and the author\'s point of view, but choose the phrasing a Chinese essayist would naturally use. Avoid translationese, slogans, empty praise, and formulaic AI language. Return exactly one valid JSON object: {"title":"Chinese title","description":"Chinese description","tags":["Chinese tag"]}. No markdown, no commentary, no placeholders.';
    const metadataResult = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
      max_completion_tokens: 700,
      temperature: 0.35,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: metadataInstruction }, { role: 'user', content: `TITLE:\n${title}\n\nDESCRIPTION:\n${description}` }],
      response_format: { type: 'json_object' },
    });
    const metadata = parseMetadata(metadataResult);
    const referenceInstruction = 'Create a faithful Simplified Chinese semantic reference from this English Markdown article. It is for an editor to check facts, not for publication. Preserve every heading, list, link, inline code, number, currency, percentage, equation, warning, and concrete claim. Use clear Chinese, but do not add interpretation, examples, or facts. Return only Markdown. No YAML frontmatter, code fences, commentary, placeholders, or ellipses.';
    const referenceResult = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
      max_completion_tokens: 4096,
      temperature: 0.05,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: referenceInstruction }, { role: 'user', content: body }],
    });
    const referenceBody = cleanMarkdown(referenceResult);
    if (!referenceBody || referenceBody.length < 20) throw new Error('语义参考稿不完整');
    const bodyInstruction = 'You are an experienced Chinese nonfiction editor writing for laconicleon, a personal site with a calm, precise voice. Turn the supplied semantic reference into a fluent standalone Simplified Chinese essay. Use the English original only to verify facts. Do not translate sentence by sentence: split or merge sentences, change clause order, and rebuild transitions when that reads better in Chinese. Keep the author\'s first-person voice when present. Preserve all Markdown headings, lists, links, inline code, code blocks, numbers, currencies, percentages, equations, and factual claims. Do not invent examples, sources, claims, or a stronger conclusion. Avoid translationese and AI habits: unnecessary “此外/然而/通过…实现”, overblown praise, “不仅…而且…”, slogan-like endings, repeated three-part lists, and excessive em dashes. Prefer direct verbs, concrete nouns, varied sentence rhythm, and restrained wording. Return only the publication-ready Markdown body. No YAML frontmatter, code fences, commentary, placeholders, or ellipses.';
    const bodyResult = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
      max_completion_tokens: 4096,
      temperature: 0.42,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: bodyInstruction }, { role: 'user', content: `ENGLISH ORIGINAL (fact check only):\n${body}\n\nCHINESE SEMANTIC REFERENCE (rewrite this):\n${referenceBody}` }],
    });
    const translated = { ...metadata, body: cleanMarkdown(bodyResult), referenceBody };
    if (!translated.title || !translated.description || !translated.body || translated.body.length < 20) throw new Error('中文成稿不完整');
    return json(translated);
  } catch (error) {
    console.error('Post translation failed', error instanceof Error ? error.message : 'unknown error');
    return json({ error: '中文草稿生成失败，请稍后重试。' }, { status: 502 });
  }
}
