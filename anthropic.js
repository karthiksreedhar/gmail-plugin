require('dotenv').config();

function getAnthropicApiKey() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim();
}

function getAnthropicModel() {
  return String(process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001').trim();
}

function normalizeText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');
  if (content == null) return '';
  return String(content);
}

async function invokeAnthropic({
  messages,
  model,
  temperature = 0.2,
  maxOutputTokens = 2048
}) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error('Missing Anthropic API key. Set ANTHROPIC_API_KEY.');
  }

  const systemParts = [];
  const chatMessages = [];

  for (const msg of messages || []) {
    const roleRaw = String(msg?.role || 'user').toLowerCase();
    const text = normalizeText(msg?.content);
    if (!text.trim()) continue;

    if (roleRaw === 'system') {
      systemParts.push(text);
      continue;
    }

    chatMessages.push({
      role: roleRaw === 'assistant' ? 'assistant' : 'user',
      content: text
    });
  }

  const targetModel = model || getAnthropicModel();
  const body = {
    model: targetModel,
    max_tokens: maxOutputTokens,
    temperature,
    messages: chatMessages.length ? chatMessages : [{ role: 'user', content: '' }]
  };
  if (systemParts.length > 0) {
    body.system = systemParts.join('\n\n');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage = data?.error?.message || `Anthropic request failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const text = Array.isArray(data?.content)
    ? data.content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n').trim()
    : '';

  // stopReason lets callers detect output truncated at max_tokens
  // ('max_tokens') vs a natural finish ('end_turn').
  return { content: text, model: targetModel, stopReason: data?.stop_reason || null };
}

module.exports = {
  invokeAnthropic,
  getAnthropicApiKey,
  getAnthropicModel
};
