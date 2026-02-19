import type {
  ConversationMessage,
  FanProfile,
  CreatorPersona,
} from '../types/index';

interface PromptInput {
  conversation: ConversationMessage[];
  fanProfile: FanProfile;
  creatorPersona: CreatorPersona;
}

interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildSuggestionPrompt(input: PromptInput): BuiltPrompt {
  const { conversation, fanProfile, creatorPersona } = input;

  const historyText = conversation
    .map((m) => `[${m.role === 'fan' ? 'Fan' : 'You'}]: ${m.text}`)
    .join('\n');

  const subDuration = calculateSubDuration(fanProfile.firstSeen);

  const system = `You are an expert OnlyFans chatter managing conversations on behalf of a creator.
Your goal is to maximize fan engagement and revenue while maintaining an authentic,
warm tone that matches the creator's persona.

Creator persona: ${creatorPersona.name} — ${creatorPersona.description}
Fan profile: Name: ${fanProfile.displayName} | Subscribed: ${subDuration} | Total spent: $${fanProfile.lifetimeValue.toFixed(2)} | Last interaction: ${formatLastSeen(fanProfile.lastSeen)}

Generate exactly 3 reply options as JSON:
[
  { "type": "engage", "text": "..." },
  { "type": "soft_upsell", "text": "..." },
  { "type": "direct_upsell", "text": "..." }
]

Respond ONLY with the JSON array. No preamble, no explanation, no markdown fences.`;

  const user = `Conversation history (${conversation.length} messages):
${historyText}

Generate 3 reply suggestions now.`;

  return { system, user };
}

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
