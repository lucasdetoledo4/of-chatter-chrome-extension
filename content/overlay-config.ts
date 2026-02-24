import type { SuggestionType, SuggestionMode } from '../types/index';

// ─── Type configuration ───────────────────────────────────────────────────────

export interface TypeConfig {
  accent: string;      // left border color
  labelBg: string;     // badge background
  labelColor: string;  // badge text
  label: string;       // display label
}

export const TYPE_CONFIG: Record<SuggestionType, TypeConfig> = {
  engage: {
    accent: '#10b981',
    labelBg: 'rgba(16, 185, 129, 0.12)',
    labelColor: '#34d399',
    label: 'Engage',
  },
  soft_upsell: {
    accent: '#f59e0b',
    labelBg: 'rgba(245, 158, 11, 0.12)',
    labelColor: '#fbbf24',
    label: 'Soft Sell',
  },
  direct_upsell: {
    accent: '#8b5cf6',
    labelBg: 'rgba(139, 92, 246, 0.12)',
    labelColor: '#a78bfa',
    label: 'Direct',
  },
};

// Position-based badge config for non-sell modes — type field is unreliable
// (model outputs "engage" for all 3), so we label by intent instead.
export const MODE_TIER_CONFIG: Partial<Record<SuggestionMode, TypeConfig[]>> = {
  warm_up: [
    { accent: '#10b981', labelBg: 'rgba(16, 185, 129, 0.12)', labelColor: '#34d399', label: 'Personal' },
    { accent: '#10b981', labelBg: 'rgba(16, 185, 129, 0.12)', labelColor: '#34d399', label: 'Warmth'   },
    { accent: '#10b981', labelBg: 'rgba(16, 185, 129, 0.12)', labelColor: '#34d399', label: 'Light'    },
  ],
  re_engage: [
    { accent: '#8b5cf6', labelBg: 'rgba(139, 92, 246, 0.12)', labelColor: '#a78bfa', label: 'Check-in' },
    { accent: '#8b5cf6', labelBg: 'rgba(139, 92, 246, 0.12)', labelColor: '#a78bfa', label: 'Remind'   },
    { accent: '#8b5cf6', labelBg: 'rgba(139, 92, 246, 0.12)', labelColor: '#a78bfa', label: 'Nudge'    },
  ],
};

// ─── Icons ────────────────────────────────────────────────────────────────────

export const ICON_SPARKLE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z"/>
  <path d="M19 15L19.5 17.5L22 18L19.5 18.5L19 21L18.5 18.5L16 18L18.5 17.5L19 15Z" opacity="0.6"/>
  <path d="M5 3L5.4 4.6L7 5L5.4 5.4L5 7L4.6 5.4L3 5L4.6 4.6L5 3Z" opacity="0.6"/>
</svg>`;

export const ICON_REGEN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
</svg>`;

export const ICON_CHEVRON_UP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="18 15 12 9 6 15"/>
</svg>`;

export const ICON_CHEVRON_DOWN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="6 9 12 15 18 9"/>
</svg>`;
