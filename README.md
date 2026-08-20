# Order Bot

A Discord.js v14 order ticket bot for design services.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure environment**
   ```
   cp .env.example .env
   ```
   Fill in `.env`:
   - `BOT_TOKEN` — Your bot token from the Discord Developer Portal
   - `CLIENT_ID` — Your bot's application/client ID
   - `GUILD_ID` — Your server's guild ID
   - `STAFF_ROLE_ID` — The role ID that can manage tickets (see all channels, run all commands)
   - `EMOJI_OPEN` / `EMOJI_CLOSED` / `EMOJI_DELAYED` — Emoji for the panel (unicode or custom `<:name:id>`)
   - `DASHBOARD_BANNER_URL` / `DASHBOARD_FOOTER_URL` — Banner/footer images shown at the top/bottom of the `/dashboard send` panel
   - `SUPPORT_BANNER_URL` / `SUPPORT_FOOTER_URL` — Banner/footer images shown at the top/bottom of each opened support ticket. Each falls back to its `DASHBOARD_*` counterpart if unset.
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase project URL and service-role key, used by `/quota` (see below). Run `supabase/quota_schema.sql` in the Supabase SQL editor once before first use.

3. **Deploy commands**
   ```
   node deploy-commands.js
   ```

4. **Start the bot**
   ```
   node index.js
   ```
   Or with systemctl, use your standard service unit.

---

## Commands

| Command | Description |
|---|---|
| `/order panel #channel` | Sends the order panel with dropdown to a channel |
| `/order move <category>` | Moves the ticket to a different category (run inside ticket) |
| `/order fix` | Re-registers a channel as a ticket after restart |
| `/order close` | Sends a "Order Closed / Fulfilled" embed |
| `/order add @user` | Grants a user access to the ticket |
| `/order remove @user` | Removes a user's access to the ticket |
| `/order delete` | Deletes the ticket channel after 3 seconds |

All commands except the panel dropdown are **staff-only** (requires `STAFF_ROLE_ID`).

---

## How tickets work

- Ticket channels are tracked using the **channel topic** (`ORDER_TICKET:{service}:{userId}`). No database needed.
- Categories (`Livery Design`, `Uniform Design`, `Graphic Design`, `Discord Setup`) are created automatically if missing.
- Channel name format: `order-{username}` (sanitized to alphanumeric).
- A user can only have one open ticket per service type at a time.

---

## Message quota tracking (`/quota`)

Tracks how many messages members send per "wave," checked against a per-role quota. Backed by Supabase — run `supabase/quota_schema.sql` once in your project's SQL editor before using these commands.

| Command | Description |
|---|---|
| `/quota team @role {number}` | Sets (or updates) the message quota for a team role. Applies immediately to the active wave and becomes the default for future waves. |
| `/quota startwave` | Starts wave 1. Only needed once, ever. |
| `/quota endwave` | Ends the current wave and immediately starts the next one (auto-incrementing). |
| `/quota wave [number]` | Shows an embed of everyone holding a configured team role, their message count, and ✅/❌ against their quota. Defaults to the current wave. |
| `/quota view` | Lists all configured team roles and their quotas. |

- A member's quota is whichever configured team role they hold with the **highest** quota, if they hold more than one.
- Only members holding at least one configured team role are tracked; messages from everyone else are ignored.
- All `/quota` commands are staff-only (`STAFF_ROLE_ID`).

---

## Customizing the panel embed

Edit the status lines in `commands/order.js` inside `handlePanel()` — swap the emoji env vars and text to reflect actual open/closed/delayed states.

Updated August 18, 2026
