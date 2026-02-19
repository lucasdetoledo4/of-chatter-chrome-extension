import type { ConversationMessage, FanProfile } from '../types/index';

export const MOCK_FAN_PROFILE: FanProfile = {
  fanId: '1234567',
  displayName: 'BigFan99',
  firstSeen: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
  lastSeen: new Date().toISOString(),
  lifetimeValue: 148.5,
  messageCount: 32,
  tags: ['custom-content', 'responsive'],
  notes: 'Loves behind-the-scenes content. Often asks about gym pics.',
  ppvHistory: [
    { contentId: 'ppv_001', price: 25, date: '2025-12-10T14:00:00Z' },
    { contentId: 'ppv_002', price: 40, date: '2026-01-05T10:30:00Z' },
  ],
};

export const MOCK_CONVERSATION: ConversationMessage[] = [
  { role: 'creator', text: 'Hey, thanks for subscribing! 💕' },
  { role: 'fan', text: 'Hey! Love your content, so happy I found you!' },
  { role: 'creator', text: 'Aww that makes my day 🥰 What type of content do you enjoy most?' },
  { role: 'fan', text: 'Honestly the gym stuff and anything behind the scenes' },
  { role: 'creator', text: "Omg yes! I just filmed something super spicy from today's workout 👀" },
  { role: 'fan', text: 'Oh wow, I would love to see that!' },
];

export const MOCK_FAN_MESSAGES = [
  'hey are you there? 😊',
  'do you do custom content?',
  'what would a private video cost?',
  "just renewed my sub, you're amazing 🔥",
  'can we chat sometime?',
];
