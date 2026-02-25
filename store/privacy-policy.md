# Privacy Policy — Chatter Ghost

**Last updated: February 2026**

## What data we collect

Chatter Ghost stores the following data **locally in your browser** using Chrome's built-in storage API:

- **Anthropic API key** — entered by you, stored in `chrome.storage.sync`, never transmitted to any server other than Anthropic's API
- **Fan profiles** — display names, message counts, spend estimates, and notes scraped from the active chat page, stored in `chrome.storage.local`
- **Creator profiles** — display name and writing style summary, stored in `chrome.storage.local`
- **Panel preferences** — position, size, and mode settings, stored in `chrome.storage.local`

## What data leaves your browser

The only external service Chatter Ghost communicates with is the **Anthropic API** (`api.anthropic.com`). The following data is sent per request:

- Recent conversation messages (last 20) from the active chat
- Fan profile summary (spend tier, subscription duration, tags)
- Creator persona settings

No data is sent to any server operated by the developers of Chatter Ghost.

## What data we do NOT collect

- We do not collect analytics or usage data
- We do not operate any backend server
- We do not have access to your API key after it is saved to your browser
- We do not store or transmit payment information

## Data retention

All data is stored locally in your browser. You can clear it at any time by:
- Removing the extension from Chrome
- Clearing extension storage via `chrome://extensions` → Details → Clear Data

## Third-party services

This extension uses the **Anthropic Claude API**. Please review Anthropic's privacy policy at [anthropic.com/privacy](https://anthropic.com/privacy) for details on how your API requests are handled.

## Contact

For questions about this privacy policy, open an issue at the project repository or contact the developer directly.
