// ─── Storage keys ─────────────────────────────────────────────────────────────

export enum StorageKey {
  ApiKey          = 'ANTHROPIC_API_KEY',
  DefaultModel    = 'DEFAULT_MODEL',
  MaxSuggestions  = 'MAX_SUGGESTIONS',
  CreatorType     = 'CREATOR_TYPE',
  ActiveCreatorId = 'ACTIVE_CREATOR_ID',
  Creators        = 'CREATORS',
  SuggestionMode  = 'OFC_SUGGESTION_MODE',
  FanModePrefix   = 'ofc_mode:',
  FanPrefix       = 'fan:',
  CreatorPrefix   = 'creator:',
}

// ─── Model identifiers ────────────────────────────────────────────────────────

export const MODEL_HAIKU  = 'claude-haiku-4-5-20251001';
export const MODEL_SONNET = 'claude-sonnet-4-6';

// ─── Anthropic API ────────────────────────────────────────────────────────────

export const ANTHROPIC_API_URL          = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_API_VERSION      = '2023-06-01';
export const ANTHROPIC_MAX_TOKENS       = 1024;
export const ANTHROPIC_BETA_CACHE       = 'prompt-caching-2024-07-31';
export const LONG_CONV_THRESHOLD   = 30;
export const API_RETRY_DELAYS: number[] = [1000, 2000, 4000];

// ─── Injection / observer timings ────────────────────────────────────────────

export const INJECT_RETRY_LIMIT    = 10;
export const INJECT_RETRY_DELAY_MS = 500;
export const SPA_NAV_DEBOUNCE_MS   = 300;
export const MESSAGE_DEBOUNCE_MS   = 400;
export const ONLINE_POLL_MS        = 30_000;
export const STYLE_REFRESH_MS      = 7 * 24 * 60 * 60 * 1000;

// ─── UI feedback timings (ms) ─────────────────────────────────────────────────

export const REGEN_FEEDBACK_MS  = 2000;
export const REGEN_COOLDOWN_MS  = 1000;
export const NOTES_SAVED_MS     = 1500;
export const DROP_GUARD_MS      = 10;
export const HISTORY_MAX_SETS   = 3;

// ─── Prompt / conversation limits ─────────────────────────────────────────────

export const MAX_CONVERSATION_MESSAGES  = 20;
export const STYLE_ANALYSIS_MIN_MSGS    = 5;
export const USED_SUGGESTIONS_TRACK_MAX = 10;
export const USED_SUGGESTIONS_PROMPT_MAX = 5;
export const USED_SUGGESTION_CHAR_CAP   = 80;
export const MSG_SHORT_WORDS            = 8;
export const MSG_LONG_WORDS             = 30;
export const CREATOR_STYLE_MAX_CHARS    = 600;

// ─── Fan profile / spend tier thresholds ─────────────────────────────────────

export const PPV_TIER_LOW_MAX  = 50;
export const PPV_TIER_MID_MAX  = 200;
export const TIME_WASTER_MSGS  = 15;
export const QUIET_FAN_DAYS    = 7;
export const PPV_PRICE_MAX     = 500;
export const PROFILE_PRUNE_DAYS = 90;

// ─── Variation hints ─────────────────────────────────────────────────────────

export const MAX_HINT_INDICES = 3;

// ─── Trigger word detection ───────────────────────────────────────────────────
// Fan messages matching this pattern signal purchase intent.
// Auto-switches to Sell mode so the AI immediately generates upsell suggestions.
export const TRIGGER_SELL_RE = /\b(customs?|menu|price|how\s+much|costs?|rates?|fee|buy|purchase|order|request|catalogue|catalog|unlock|ppv|pay\s+per\s+view|send\s+me|what\s+do\s+you\s+offer|what('s|s)\s+(included|available))\b/i;
export const TRIGGER_NOTICE_MS = 4000;

// ─── Routing ──────────────────────────────────────────────────────────────────

export const CHAT_URL_PATTERNS     = ['/my/chats/', '/messages/'];
export const LEGACY_PLACEHOLDER_RE = /^(Creator \d+|New Creator)$/;

// ─── DOM ──────────────────────────────────────────────────────────────────────

export const PANEL_HOST_ID       = 'ofc-suggestion-host';
export const PANEL_POSITION_KEY  = 'ofc_panel_pos';
