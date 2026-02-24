// ─── Fan Profile ─────────────────────────────────────────────────────────────

export interface PpvHistoryEntry {
  contentId: string;
  price: number;
  date: string; // ISO 8601
}

export interface FanProfile {
  fanId: string;
  displayName: string;
  firstSeen: string; // ISO 8601
  lastSeen: string; // ISO 8601
  lifetimeValue: number; // USD
  messageCount: number;
  tags: string[]; // e.g. ["whale", "custom-content", "ghosted"]
  notes: string; // freeform operator notes
  ppvHistory: PpvHistoryEntry[];
  usedSuggestions?: string[]; // last 10 inserted suggestion texts
}

export type FanProfileUpdate = Partial<Omit<FanProfile, 'fanId'>>;

// ─── Suggestions ─────────────────────────────────────────────────────────────

export type SuggestionType = 'engage' | 'soft_upsell' | 'direct_upsell';

export type SuggestionMode = 'warm_up' | 'sell' | 're_engage';

export interface Suggestion {
  type: SuggestionType;
  text: string;
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export type MessageRole = 'fan' | 'creator';

export interface ConversationMessage {
  role: MessageRole;
  text: string;
  timestamp?: string; // ISO 8601, optional (may not always be scrapeable)
}

// ─── Creator Persona ──────────────────────────────────────────────────────────

export type CreatorType =
  | 'egirl'          // young, playful, teasing, emoji-heavy, FOMO-driven
  | 'woman'          // standard female creator, warm, confident, sensual
  | 'mature_woman'   // experienced, nurturing-but-seductive, fewer emojis
  | 'man'            // gym/lifestyle, masculine, direct, confident
  | 'picture_only'   // photo sets focus, visual language, gallery teasers
  | 'video_creator'  // custom clips, motion language, behind-the-scenes
  | 'couple';        // "we" language, voyeuristic angle, double content

export interface CreatorPersona {
  name: string;
  type: CreatorType;
}

// ─── Creator Profile ──────────────────────────────────────────────────────────

export interface CreatorProfile {
  creatorId: string;
  displayName: string;
  bio: string;
  profilePhotoUrl?: string;
  recentCaptions: string[];
  writingStyle?: string;      // AI-generated style summary, cached after first run
  styleAnalyzedAt?: string;   // ISO 8601 — when writingStyle was last generated
  scrapedAt: string;          // ISO 8601
}

// ─── Creator Account ──────────────────────────────────────────────────────────

export interface CreatorAccount {
  id: string;        // e.g. "c_1741234567890"
  name: string;      // display name, e.g. "Sofia"
  type: CreatorType;
  createdAt: string; // ISO 8601
}

// ─── Background Messaging ─────────────────────────────────────────────────────

export interface GetSuggestionsRequest {
  type: 'GET_SUGGESTIONS';
  conversation: ConversationMessage[];
  fanProfile: FanProfile;
  creatorPersona: CreatorPersona;
  /** Injected on regenerate to push the model toward a different style */
  variationHint?: string;
  creatorProfile?: CreatorProfile;
  /** Creator's own sent messages extracted from conversation history */
  creatorRealMessages?: string[];
  mode?: SuggestionMode;
}

export interface AnalyzeCreatorStyleRequest {
  type: 'ANALYZE_CREATOR_STYLE';
  creatorMessages: string[];
}

// Discriminated union — add more message types here as the extension grows
export type BackgroundRequest = GetSuggestionsRequest | AnalyzeCreatorStyleRequest;

export type BackgroundResponse =
  | { success: true; suggestions: Suggestion[]; writingStyle?: string }
  | { success: false; error: string };

// ─── Anthropic API ────────────────────────────────────────────────────────────

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Structured system block — required when using prompt caching.
export interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicApiRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
}

export interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

export interface AnthropicApiResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// ─── Storage Schemas ──────────────────────────────────────────────────────────

export interface SyncStorageSchema {
  ANTHROPIC_API_KEY?: string;
  DEFAULT_MODEL?: string;
  MAX_SUGGESTIONS?: number;
  CREATOR_TYPE?: string;          // kept for migration only
  ACTIVE_CREATOR_ID?: string;
  CREATORS?: CreatorAccount[];
}
