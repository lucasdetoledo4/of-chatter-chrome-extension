import type { FanProfile, FanProfileUpdate, CreatorProfile, CreatorAccount } from '../types/index';
import { StorageKey, PROFILE_PRUNE_DAYS } from './constants';

function fanKey(fanId: string): string {
  return `${StorageKey.FanPrefix}${fanId}`;
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
    .filter(([key]) => key.startsWith(StorageKey.FanPrefix))
    .map(([, value]) => value as FanProfile);
}

export async function deleteFanProfile(fanId: string): Promise<void> {
  await chrome.storage.local.remove(fanKey(fanId));
}

// ─── Creator Profile ──────────────────────────────────────────────────────────

function creatorKey(creatorId: string): string {
  return `${StorageKey.CreatorPrefix}${creatorId}`;
}

export async function getCreatorProfile(creatorId: string): Promise<CreatorProfile | null> {
  const key = creatorKey(creatorId);
  const result = await chrome.storage.local.get(key);
  return (result[key] as CreatorProfile) ?? null;
}

export async function upsertCreatorProfile(
  creatorId: string,
  update: Partial<Omit<CreatorProfile, 'creatorId'>>
): Promise<CreatorProfile> {
  const existing = await getCreatorProfile(creatorId);
  const now = new Date().toISOString();

  const profile: CreatorProfile = existing
    ? { ...existing, ...update, creatorId }
    : {
        creatorId,
        displayName: update.displayName ?? '',
        bio: update.bio ?? '',
        recentCaptions: update.recentCaptions ?? [],
        scrapedAt: now,
        ...update,
      };

  await chrome.storage.local.set({ [creatorKey(creatorId)]: profile });
  return profile;
}

// ─── Creator Accounts ─────────────────────────────────────────────────────────

export async function getCreators(): Promise<CreatorAccount[]> {
  const r = await chrome.storage.sync.get(StorageKey.Creators);
  return (r[StorageKey.Creators] as CreatorAccount[]) ?? [];
}

export async function upsertCreatorAccount(account: CreatorAccount): Promise<void> {
  const list = await getCreators();
  const idx = list.findIndex((c) => c.id === account.id);
  if (idx >= 0) list[idx] = account; else list.push(account);
  await chrome.storage.sync.set({ [StorageKey.Creators]: list });
}

export async function deleteCreatorAccount(id: string): Promise<void> {
  const list = await getCreators();
  await chrome.storage.sync.set({ [StorageKey.Creators]: list.filter((c) => c.id !== id) });
}

export async function getActiveCreatorId(): Promise<string | undefined> {
  const r = await chrome.storage.sync.get(StorageKey.ActiveCreatorId);
  return r[StorageKey.ActiveCreatorId] as string | undefined;
}

// ─── Fan Profile ──────────────────────────────────────────────────────────────

/**
 * Remove fan profiles that haven't been seen in PROFILE_PRUNE_DAYS.
 * Called on extension install/update to keep storage under the 10MB quota.
 */
export async function pruneOldProfiles(): Promise<number> {
  const profiles = await getAllFanProfiles();
  const cutoff = Date.now() - PROFILE_PRUNE_DAYS * 24 * 60 * 60 * 1000;
  const stale = profiles.filter(
    (p) => new Date(p.lastSeen).getTime() < cutoff
  );
  if (stale.length === 0) return 0;
  await chrome.storage.local.remove(stale.map((p) => fanKey(p.fanId)));
  return stale.length;
}
