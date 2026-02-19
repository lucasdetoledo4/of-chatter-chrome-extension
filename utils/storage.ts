import type { FanProfile, FanProfileUpdate } from '../types/index';

const FAN_KEY_PREFIX = 'fan:';
// Prune profiles not seen in this many days
const PRUNE_AFTER_DAYS = 90;

function fanKey(fanId: string): string {
  return `${FAN_KEY_PREFIX}${fanId}`;
}

export async function getFanProfile(fanId: string): Promise<FanProfile | null> {
  const key = fanKey(fanId);
  const result = await chrome.storage.local.get(key);
  return (result[key] as FanProfile) ?? null;
}

export async function upsertFanProfile(
  fanId: string,
  update: FanProfileUpdate
): Promise<FanProfile> {
  const existing = await getFanProfile(fanId);
  const now = new Date().toISOString();

  const profile: FanProfile = existing
    ? { ...existing, ...update, fanId, lastSeen: update.lastSeen ?? now }
    : {
        fanId,
        displayName: update.displayName ?? fanId,
        firstSeen: now,
        lastSeen: now,
        lifetimeValue: update.lifetimeValue ?? 0,
        messageCount: update.messageCount ?? 0,
        tags: update.tags ?? [],
        notes: update.notes ?? '',
        ppvHistory: update.ppvHistory ?? [],
        ...update,
      };

  await chrome.storage.local.set({ [fanKey(fanId)]: profile });
  return profile;
}

export async function getAllFanProfiles(): Promise<FanProfile[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(FAN_KEY_PREFIX))
    .map(([, value]) => value as FanProfile);
}

export async function deleteFanProfile(fanId: string): Promise<void> {
  await chrome.storage.local.remove(fanKey(fanId));
}

/**
 * Remove fan profiles that haven't been seen in PRUNE_AFTER_DAYS.
 * Called on extension install/update to keep storage under the 10MB quota.
 */
export async function pruneOldProfiles(): Promise<number> {
  const profiles = await getAllFanProfiles();
  const cutoff = Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const stale = profiles.filter(
    (p) => new Date(p.lastSeen).getTime() < cutoff
  );
  if (stale.length === 0) return 0;
  await chrome.storage.local.remove(stale.map((p) => fanKey(p.fanId)));
  return stale.length;
}
