require('dotenv').config();

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function getGeminiModel() {
  return String(process.env.GEMINI_MODEL || 'gemini-1.5-pro').trim();
}

function normalizeText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');
  if (content == null) return '';
  return String(content);
}

async function invokeGemini({ messages, model, temperature = 0.2, maxOutputTokens = 2048 }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).');
  }

  const chosenModel = model || getGeminiModel();
  const systemParts = [];
  const contents = [];

  for (const msg of messages || []) {
    const roleRaw = String(msg?.role || 'user').toLowerCase();
    const text = normalizeText(msg?.content);
    if (!text.trim()) continue;

    if (roleRaw === 'system') {
      systemParts.push({ text });
      continue;
    }

    contents.push({
      role: roleRaw === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    });
  }

  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || `Gemini request failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map(p => p?.text || '').join('\n').trim()
    : '';

  return { content: text };
}

module.exports = {
  invokeGemini,
  getGeminiApiKey,
  getGeminiModel
};
