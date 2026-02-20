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

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const FALLBACK_MODEL = 'claude-sonnet-4-6';
// Threshold: use fallback model for long conversations
const LONG_CONVERSATION_THRESHOLD = 30;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const pruned = await pruneOldProfiles();
  if (pruned > 0) {
    console.log(`[OFC SW] Pruned ${pruned} stale fan profiles.`);
  }
});

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
    const { conversation, fanProfile, creatorPersona, variationHint } = request;

    const apiKey = await getApiKey();
    const { system, user } = buildSuggestionPrompt({
      conversation,
      fanProfile,
      creatorPersona,
      variationHint,
    });

    // Use fallback model for long/complex conversations
    const model =
      conversation.length > LONG_CONVERSATION_THRESHOLD
        ? FALLBACK_MODEL
        : await getModel();

    const rawText = await callAnthropicApi({ apiKey, system, user, model });
    const suggestions = parseSuggestions(rawText);

    return { success: true, suggestions };
  }

  // Dead code path — future request types handled here via discriminated union
  return { success: false, error: 'Unknown request type' };
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

async function getApiKey(): Promise<string> {
  const result = await chrome.storage.sync.get('ANTHROPIC_API_KEY') as SyncStorageSchema;
  const key = result.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'Anthropic API key not set. Open the extension popup to configure it.'
    );
  }
  return key;
}

async function getModel(): Promise<string> {
  const result = await chrome.storage.sync.get('DEFAULT_MODEL') as SyncStorageSchema;
  return result.DEFAULT_MODEL ?? DEFAULT_MODEL;
}

// ─── Anthropic API ────────────────────────────────────────────────────────────

interface CallApiParams {
  apiKey: string;
  system: string;
  user: string;
  model: string;
}

async function callAnthropicApi(params: CallApiParams): Promise<string> {
  const { apiKey, system, user, model } = params;

  const body: AnthropicApiRequest = {
    model,
    max_tokens: 1024,
    temperature: 1.0, // max diversity — safe with our structured JSON output contract
    system,
    messages: [{ role: 'user', content: user }],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
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
