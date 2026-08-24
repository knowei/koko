# Mobile Chat Design QA

## Test target

- Reference: `../artifacts/mobile-ui-audit/01-chat-home.jpg` (1264 × 2780 physical-device capture).
- Implementation: local mobile viewport at 412 × 915 CSS pixels.
- State note: the reference shows the empty-chat state, while the local profile contains message history. Layout, navigation, composer, and control density were compared independently of message content.

## Findings and fixes

- **P1 — Header overflow:** desktop navigation and account controls collided with the profile block. Mobile now keeps only avatar, name/status, and Settings in the header; primary destinations remain in the bottom navigation.
- **P1 — Composer wrapping:** text, microphone, playback, and send controls wrapped into a crowded two-line footer. Mobile now uses one row for quick actions, text, and Send. Voice input and auto-read remain available inside the quick-action menu.
- **P2 — Placeholder noise:** removed the long “跟妹妹说点什么吧” placeholder. Recording uses the shorter “正在聆听…” status only.
- **P2 — Touch sizing:** key controls use roughly 40-pixel targets, compact rounded corners, and safe-area-aware spacing.

## Verification

- Checked the full chat screen at 412 × 915.
- Opened the quick-action menu and confirmed voice input and auto-read are reachable.
- Confirmed the suggestion row scrolls horizontally instead of compressing buttons.
- Confirmed the bottom navigation remains visible and the header does not overflow.
- `npm test`, `npm run typecheck`, and `npm run build` pass.

## Final result

passed
