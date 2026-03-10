require('dotenv').config();

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function getGeminiModel() {
  return String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
}

function normalizeText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');
  if (content == null) return '';
  return String(content);
}

function normalizeModelName(name) {
  return String(name || '').trim().replace(/^models\//, '');
}

let cachedGenerateModels = null;
let cachedGenerateModelsAt = 0;
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

async function listGenerateContentModels(apiKey, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedGenerateModels && (now - cachedGenerateModelsAt) < MODELS_CACHE_TTL_MS) {
    return cachedGenerateModels;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || `ListModels failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const models = Array.isArray(data?.models) ? data.models : [];
  const supported = models
    .filter(m => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => normalizeModelName(m.name))
    .filter(Boolean);

  cachedGenerateModels = supported;
  cachedGenerateModelsAt = now;
  return supported;
}

async function resolveGeminiModel(apiKey, preferredModel, forceRefresh = false) {
  const preferred = normalizeModelName(preferredModel || getGeminiModel());
  const fallbackOrder = [
    preferred,
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro'
  ]
    .map(normalizeModelName)
    .filter(Boolean);

  try {
    const available = await listGenerateContentModels(apiKey, forceRefresh);
    if (available.length === 0) {
      return preferred || 'gemini-1.5-flash';
    }
    for (const candidate of fallbackOrder) {
      if (available.includes(candidate)) return candidate;
    }
    return available[0];
  } catch (_) {
    return preferred || 'gemini-1.5-flash';
  }
}

async function invokeGemini({
  messages,
  model,
  temperature = 0.2,
  maxOutputTokens = 2048,
  responseMimeType,
  responseSchema
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).');
  }

  let chosenModel = await resolveGeminiModel(apiKey, model);
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
  if (responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }
  if (responseSchema) {
    body.generationConfig.responseSchema = responseSchema;
  }

  async function runGenerateContent(targetModel) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return { response, data, targetModel };
  }

  let { response, data, targetModel } = await runGenerateContent(chosenModel);
  if (!response.ok) {
    const message = String(data?.error?.message || '');
    const modelError = /not found|not supported|unsupported/i.test(message);
    if (modelError) {
      const retryModel = await resolveGeminiModel(apiKey, '', true);
      if (retryModel && retryModel !== chosenModel) {
        ({ response, data, targetModel } = await runGenerateContent(retryModel));
      }
    }
  }

  if (!response.ok) {
    const apiMessage = data?.error?.message || `Gemini request failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map(p => p?.text || '').join('\n').trim()
    : '';

  return { content: text, model: targetModel };
}

module.exports = {
  invokeGemini,
  getGeminiApiKey,
  getGeminiModel
};
