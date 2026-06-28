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

## Customizing the panel embed

Edit the status lines in `commands/order.js` inside `handlePanel()` — swap the emoji env vars and text to reflect actual open/closed/delayed states.
