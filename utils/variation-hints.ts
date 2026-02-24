import { MAX_HINT_INDICES } from './constants';

// ─── Variation hints for regenerate ──────────────────────────────────────────

const VARIATION_HINTS = [
  'Be more playful and teasing than usual.',
  'Be more mysterious — give less, make them work for it.',
  'Be bolder and more direct than you normally would.',
  'Be warmer and more personal, like you genuinely missed them.',
  'Create strong FOMO — limited time, exclusive access.',
  'Be more intimate and vulnerable than usual.',
  'Keep it short and punchy — fewer words, more impact.',
  'Open each suggestion with something unexpected — no standard greetings.',
  'Type fast and sloppy — include one small typo in at least one suggestion, no self-correction.',
  'No punctuation at all. Pure stream of thought, like you\'re mid-conversation.',
  'Start mid-thought, like you\'re already deep in the conversation — skip the opener entirely.',
  'Be raw and unfiltered — messier grammar, shorter bursts, more honest energy.',
];

// Track last MAX_HINT_INDICES used hint indices so regen always feels different.
const _recentHintIndices: number[] = [];

export function pickVariationHint(): string {
  const available = VARIATION_HINTS.map((_, i) => i).filter(
    (i) => !_recentHintIndices.includes(i)
  );
  // Fallback: if somehow all are excluded (shouldn't happen), use full list
  const pool = available.length > 0 ? available : VARIATION_HINTS.map((_, i) => i);
  const chosen = pool[Math.floor(Math.random() * pool.length)]!;
  _recentHintIndices.push(chosen);
  if (_recentHintIndices.length > MAX_HINT_INDICES) _recentHintIndices.shift();
  return VARIATION_HINTS[chosen]!;
}
