import type {
  ConversationMessage,
  FanProfile,
  CreatorPersona,
  CreatorType,
  CreatorProfile,
  SuggestionMode,
} from '../types/index';
import { VOICE_GUIDE, FEW_SHOT_EXAMPLES } from './voice-guides';
import { pickVariationHint } from './variation-hints';
import {
  MAX_CONVERSATION_MESSAGES,
  MSG_SHORT_WORDS,
  MSG_LONG_WORDS,
  USED_SUGGESTIONS_PROMPT_MAX,
  USED_SUGGESTION_CHAR_CAP,
  PPV_TIER_LOW_MAX,
  PPV_TIER_MID_MAX,
  TIME_WASTER_MSGS,
  QUIET_FAN_DAYS,
} from './constants';

export { pickVariationHint };

// ─── Fan behaviour context ────────────────────────────────────────────────────

function buildFanContext(fan: FanProfile): string {
  const parts: string[] = [];

  // Spend tier — tone guidance only, not a pitch script
  if (fan.lifetimeValue >= PPV_TIER_MID_MAX) {
    parts.push('high-value spender — treat as VIP, luxury/exclusive framing if upsell arises naturally');
  } else if (fan.lifetimeValue >= PPV_TIER_LOW_MAX) {
    parts.push('regular spender — comfortable with paid content, mid-tier framing if upsell arises naturally');
  } else if (fan.lifetimeValue > 0) {
    parts.push('has spent a little — still warming up; any upsell should feel like an invitation, not a pitch');
  } else {
    if (fan.messageCount >= TIME_WASTER_MSGS) {
      parts.push('has not spent yet despite many messages — keep upsells brief if at all; rapport first');
    } else {
      parts.push('has not spent yet — build trust and connection first; upsell only if it fits naturally');
    }
  }

  // Recency signal
  const daysSinceLastSeen = Math.floor((Date.now() - new Date(fan.lastSeen).getTime()) / 86400000);
  if (daysSinceLastSeen >= QUIET_FAN_DAYS) {
    parts.push(`been quiet for ${daysSinceLastSeen} day${daysSinceLastSeen === 1 ? '' : 's'} — re-engagement tone, no sell`);
  }

  if (fan.tags.includes('whale')) parts.push('whale — responds well to exclusive/premium framing');
  if (fan.tags.includes('ghosted')) parts.push('has gone quiet before — re-engagement is the priority');
  if (fan.tags.includes('custom-content')) parts.push('has bought custom content — reference their taste');
  if (fan.ppvHistory.length > 0) parts.push(`has purchased ${fan.ppvHistory.length} PPV(s) — knows how it works`);

  return parts.length > 0 ? `Fan behaviour notes: ${parts.join('; ')}.` : '';
}

// ─── Mode tier instructions ───────────────────────────────────────────────────

function buildModeTierInstructions(mode?: SuggestionMode): string {
  if (mode === 'warm_up') {
    return `Generate exactly 3 replies. ALL focus on rapport and genuine connection — NO upsells:
1. first — ask something personal, show real curiosity
2. second — build warmth, share something of yourself, invite them in
3. third — keep the connection alive, light and comfortable`;
  }
  if (mode === 're_engage') {
    return `Generate exactly 3 replies. This fan has gone quiet. ALL focus on reactivation:
1. first — warm check-in, no pressure, acknowledge the gap naturally
2. second — remind them what they're missing, personal and specific, no hard sell
3. third — gentle nudge, give them an easy reason to reply`;
  }
  // Default: 'sell'
  return `Generate exactly 3 replies. All three MUST first respond to what the fan actually said — then differ in how far they go:
1. engage — answer/acknowledge their message genuinely. Warmth, connection. Zero sell.
2. soft_upsell — respond to their message first, then let a content nudge arise naturally from it.
3. direct_upsell — respond to their message briefly, then a clear confident CTA. Never skips the response.`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

interface PromptInput {
  conversation: ConversationMessage[];
  fanProfile: FanProfile;
  creatorPersona: CreatorPersona;
  variationHint?: string;
  creatorProfile?: CreatorProfile;
  /** Creator's own sent messages extracted from conversation history */
  creatorRealMessages?: string[];
  mode?: SuggestionMode;
}

interface BuiltPrompt {
  system: string;
  user: string;
}

function buildPersonaSection(
  creatorPersona: CreatorPersona,
  creatorProfile?: CreatorProfile,
  creatorRealMessages?: string[]
): string {
  const displayName = creatorProfile?.displayName || creatorPersona.name;

  // Voice description: AI-generated style beats static guide
  const voiceDesc = creatorProfile?.writingStyle
    ? `Style: ${creatorProfile.writingStyle}`
    : VOICE_GUIDE[creatorPersona.type];

  const bioLine = creatorProfile?.bio
    ? `Their bio: "${creatorProfile.bio}"\n`
    : '';

  // Few-shot examples: real messages beat static examples
  const hasRealMessages = creatorRealMessages && creatorRealMessages.length >= 3;
  const examplesSection = hasRealMessages
    ? `Real messages they've sent — match this voice exactly:\n${creatorRealMessages
        .slice(-5)
        .map((m) => `  - "${m}"`)
        .join('\n')}`
    : FEW_SHOT_EXAMPLES[creatorPersona.type];

  return `## Creator: ${displayName}
${bioLine}${voiceDesc}
${examplesSection}`;
}

export function buildSuggestionPrompt(input: PromptInput): BuiltPrompt {
  const { conversation, fanProfile, creatorPersona, variationHint, creatorProfile, creatorRealMessages, mode } = input;

  // Limit to the most recent messages to keep token usage predictable.
  const recentConversation = conversation.slice(-MAX_CONVERSATION_MESSAGES);

  const historyText = recentConversation
    .map((m) => `[${m.role === 'fan' ? 'Fan' : 'You'}]: ${m.text}`)
    .join('\n');

  const personaSection = buildPersonaSection(creatorPersona, creatorProfile, creatorRealMessages);
  const fanContext = buildFanContext(fanProfile);
  const usedBlock = fanProfile.usedSuggestions?.length
    ? `\n\n## Do not repeat\nThese replies were already sent to this fan — avoid anything similar:\n${fanProfile.usedSuggestions.slice(-USED_SUGGESTIONS_PROMPT_MAX).map((t) => `- "${t.slice(0, USED_SUGGESTION_CHAR_CAP)}"`).join('\n')}`
    : '';
  const subDuration = calculateSubDuration(fanProfile.firstSeen);
  const displayName = creatorProfile?.displayName || creatorPersona.name;

  // Scale reply length to the fan's message complexity.
  // Short questions (≤MSG_SHORT_WORDS words) get tight 1-2 sentence replies — not paragraphs.
  const lastFanMsg = [...recentConversation].reverse().find((m) => m.role === 'fan');
  const wordCount = lastFanMsg?.text.trim().split(/\s+/).length ?? 0;
  const lengthInstruction = wordCount <= MSG_SHORT_WORDS
    ? '\n\n## Length\nThe fan sent a short message. Keep every reply to 1–2 sentences max. Match their brevity — don\'t over-explain.'
    : wordCount >= MSG_LONG_WORDS
    ? '\n\n## Length\nThe fan sent a longer message. Replies can be fuller — 3–4 sentences where it feels natural.'
    : '';

  const system = `You are a professional OnlyFans chatter writing AS the creator — the fan must believe they're talking directly to ${displayName}.

${personaSection}

## Fan profile
Name: ${fanProfile.displayName} | Subscribed: ${subDuration} | Total spent: $${fanProfile.lifetimeValue.toFixed(2)} | Last seen: ${formatLastSeen(fanProfile.lastSeen)}
${fanContext}${usedBlock}

## Suggestion tiers
${buildModeTierInstructions(mode)}

## Human typing behavior
You are typing fast — on mobile or laptop, not drafting an essay.
- Most messages don't end with punctuation. Drop it unless the tone demands it.
- Fragments are fine. Short sentences. Even one word.
- 1 in 3 messages: one minor typo or autocorrect artifact ("yuo", "jsut", "taht", "fo"). Never on a key word. Never self-correct in the same message.
- Lowercase openers when the energy is casual ("hey", "omg", "wait—")
- Use "..." for trailing thoughts or pauses. Never use "--" or "—" — they read as formal or robotic
- Emphasis through doubling ("heyy", "noooo", "okayy") not ALL CAPS
- Never use parentheses, semicolons, "--", or em dashes (—)

## Rules
- ALWAYS address what the fan said first. A reply that ignores their message and jumps straight to selling feels robotic and breaks trust.
- Each reply must sound DIFFERENT in structure, length, and opening. Never start two with the same word or phrase.
- Stay fully in character. No corporate language, no filler phrases.
- Vary sentence length. Mix short punchy lines with longer ones.
- Respond ONLY with the JSON array. No preamble, no markdown fences.${lengthInstruction}

Output format (type may be "engage" for all 3 in non-sell modes):
[
  { "type": "engage", "text": "..." },
  { "type": "soft_upsell", "text": "..." },
  { "type": "direct_upsell", "text": "..." }
]`;

  const variationLine = variationHint
    ? `\n\nIMPORTANT: ${variationHint} Make these feel completely different from any previous response.`
    : '';

  const user = `Conversation (${recentConversation.length} messages):
${historyText}

Reply as ${displayName} now.${variationLine}`;

  return { system, user };
}

// ─── Preset personas ──────────────────────────────────────────────────────────

export const CREATOR_PRESETS: Record<CreatorType, CreatorPersona> = {
  egirl:        { name: 'Luna', type: 'egirl' },
  woman:        { name: 'Sophia', type: 'woman' },
  mature_woman: { name: 'Victoria', type: 'mature_woman' },
  man:          { name: 'Tyler', type: 'man' },
  picture_only: { name: 'Aria', type: 'picture_only' },
  video_creator:{ name: 'Jade', type: 'video_creator' },
  couple:       { name: 'Mia & Alex', type: 'couple' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateSubDuration(firstSeen: string): string {
  const ms = Date.now() - new Date(firstSeen).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return 'less than a day';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

function formatLastSeen(lastSeen: string): string {
  const ms = Date.now() - new Date(lastSeen).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
