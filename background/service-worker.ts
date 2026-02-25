import type {
  BackgroundRequest,
  BackgroundResponse,
  AnthropicApiRequest,
  AnthropicApiResponse,
  Suggestion,
  SyncStorageSchema,
} from '../types/index';
import { buildSuggestionPrompt } from '../utils/prompt-builder';
import { pruneOldProfiles } from '../utils/storage';
import {
  MODEL_HAIKU,
  MODEL_SONNET,
  ANTHROPIC_API_URL,
  ANTHROPIC_API_VERSION,
  ANTHROPIC_BETA_CACHE,
  ANTHROPIC_MAX_TOKENS,
  LONG_CONV_THRESHOLD,
  API_RETRY_DELAYS,
  CREATOR_STYLE_MAX_CHARS,
  StorageKey,
} from '../utils/constants';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => { void pruneOldProfiles(); });
chrome.runtime.onStartup.addListener(() => { void pruneOldProfiles(); });

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    request: BackgroundRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ): true => {
    // CRITICAL: return true synchronously to keep the message channel open
    // for the async sendResponse call. Without this, Chrome closes the channel.
    handleMessage(request)
      .then(sendResponse)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message });
      });

    return true;
  }
);

async function handleMessage(
  request: BackgroundRequest
): Promise<BackgroundResponse> {
  if (request.type === 'GET_SUGGESTIONS') {
    const { conversation, fanProfile, creatorPersona, variationHint, creatorProfile, creatorRealMessages, mode } = request;

    const apiKey = await getApiKey();
    const { system, user } = buildSuggestionPrompt({
      conversation,
      fanProfile,
      creatorPersona,
      variationHint,
      creatorProfile,
      creatorRealMessages,
      mode,
    });

    // Use fallback model for long/complex conversations
    const model =
      conversation.length > LONG_CONV_THRESHOLD
        ? MODEL_SONNET
        : await getModel();

    const rawText = await callAnthropicApi({ apiKey, system, user, model, cacheSystem: true });
    const suggestions = parseSuggestions(rawText);

    return { success: true, suggestions };
  }

  if (request.type === 'ANALYZE_CREATOR_STYLE') {
    const apiKey = await getApiKey();
    const system = `You are a writing style analyst. Describe a creator's messaging style in 3-4 sentences covering: emoji usage, sentence length and structure, tone, characteristic words or phrases, and how they open messages. Be specific — this will train an AI to mimic their voice.`;
    const user = `Analyse these messages:\n${request.creatorMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}`;
    const style = await callAnthropicApi({ apiKey, system, user, model: MODEL_HAIKU });
    return { success: true, suggestions: [], writingStyle: style.slice(0, CREATOR_STYLE_MAX_CHARS) };
  }

  if (request.type === 'TRANSLATE_SUGGESTION') {
    const { suggestionText, fanMessage } = request;
    const apiKey = await getApiKey();
    const system = `Translate the creator's chat reply to match the fan's language. Keep it casual, warm, and natural — never formal. Return ONLY valid JSON: {"translatedText":"...","detectedLanguage":"English name of the language, e.g. Spanish"}`;
    const user = `Fan's message (for language detection): "${fanMessage}"\nCreator reply to translate: "${suggestionText}"`;
    const raw = await callAnthropicApi({ apiKey, system, user, model: MODEL_HAIKU });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as { translatedText: string; detectedLanguage: string };
    return { success: true, suggestions: [], translatedText: parsed.translatedText, detectedLanguage: parsed.detectedLanguage };
  }

  // Dead code path — future request types handled here via discriminated union
  return { success: false, error: 'Unknown request type' };
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

async function getApiKey(): Promise<string> {
  const result = await chrome.storage.sync.get(StorageKey.ApiKey) as SyncStorageSchema;
  const key = result.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'Anthropic API key not set. Open the extension popup to configure it.'
    );
  }
  return key;
}

async function getModel(): Promise<string> {
  const result = await chrome.storage.sync.get(StorageKey.DefaultModel) as SyncStorageSchema;
  return result.DEFAULT_MODEL ?? MODEL_HAIKU;
}

// ─── Anthropic API ────────────────────────────────────────────────────────────

interface CallApiParams {
  apiKey: string;
  system: string;
  user: string;
  model: string;
  /** Wrap the system prompt as a cached content block (prompt caching beta). */
  cacheSystem?: boolean;
}

async function callAnthropicApi(params: CallApiParams): Promise<string> {
  const { apiKey, system, user, model, cacheSystem = false } = params;

  // When caching, system must be a structured array with cache_control on the
  // last block. The API caches the prefix up to (and including) that block.
  // Cache TTL is 5 minutes — hits cost ~10% of normal input token price.
  const systemPayload: AnthropicApiRequest['system'] = cacheSystem
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const body: AnthropicApiRequest = {
    model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    temperature: 1.0, // max diversity — safe with our structured JSON output contract
    system: systemPayload,
    messages: [{ role: 'user', content: user }],
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (cacheSystem) {
    headers['anthropic-beta'] = ANTHROPIC_BETA_CACHE;
  }

  const fetchOnce = () =>
    fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

  let response = await fetchOnce();

  // Retry with exponential backoff on 529 (overloaded) and 5xx transient errors.
  // 4xx errors (bad key, invalid request) are not retried — they won't recover.
  for (const delay of API_RETRY_DELAYS) {
    if (response.ok) break;
    if (response.status !== 529 && response.status < 500) break;
    await new Promise((r) => setTimeout(r, delay));
    response = await fetchOnce();
  }

  if (!response.ok) {
    const errorText = await response.text();
    let message = `API error ${response.status}`;
    try {
      const body = JSON.parse(errorText) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch { /* leave generic message */ }
    if (response.status === 529) message = 'API overloaded — please try again in a moment';
    throw new Error(message);
  }

  const data = (await response.json()) as AnthropicApiResponse;

  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in Anthropic API response');
  }

  return textBlock.text;
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

function parseSuggestions(raw: string): Suggestion[] {
  // Strip markdown code fences if the model includes them despite instructions
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      throw new Error('Expected JSON array');
    }

    const suggestions: Suggestion[] = parsed
      .filter(
        (item): item is { type: string; text: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).type === 'string' &&
          typeof (item as Record<string, unknown>).text === 'string'
      )
      .map((item) => ({
        type: item.type as Suggestion['type'],
        text: item.text,
      }));

    if (suggestions.length === 0) {
      throw new Error('No valid suggestions parsed');
    }

    return suggestions;
  } catch {
    // Graceful fallback: wrap the raw text as a single engage suggestion
    console.warn('[OFC SW] Failed to parse suggestions as JSON, using fallback.', raw);
    return [{ type: 'engage', text: raw.slice(0, 500) }];
  }
}
