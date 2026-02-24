import type { FanProfile } from '../types/index';
import { PPV_TIER_MID_MAX, TIME_WASTER_MSGS, QUIET_FAN_DAYS } from './constants';

// Tags managed by this rule engine.
// Manual tags outside this set are preserved unchanged.
const MANAGED_TAGS = new Set(['whale', 'ppv buyer', 'time waster', 'ghosted']);

/**
 * Derive automatic tags from a fan's profile data.
 *
 * Rules:
 *   whale       — lifetime spend >= $200 (VIP, premium framing)
 *   ppv buyer   — at least one PPV purchase (proven buyer)
 *   time waster — 15+ messages with $0 spent (deprioritise)
 *   ghosted     — not seen in 7+ days (re-engagement candidate)
 *
 * Manual tags set by the chatter that are not in MANAGED_TAGS
 * are always preserved.
 */
export function computeAutoTags(profile: FanProfile): string[] {
  const auto: string[] = [];

  if (profile.lifetimeValue >= PPV_TIER_MID_MAX) {
    auto.push('whale');
  }

  if (profile.ppvHistory.length >= 1) {
    auto.push('ppv buyer');
  }

  if (profile.messageCount >= TIME_WASTER_MSGS && profile.lifetimeValue === 0) {
    auto.push('time waster');
  }

  const daysSince = Math.floor(
    (Date.now() - new Date(profile.lastSeen).getTime()) / 86400000
  );
  if (daysSince >= QUIET_FAN_DAYS) {
    auto.push('ghosted');
  }

  // Preserve chatter-set tags not managed by this engine
  const manual = profile.tags.filter((t) => !MANAGED_TAGS.has(t));
  return [...manual, ...auto];
}
