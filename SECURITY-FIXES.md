# Siftly Security Fixes

Security hardening applied to the Siftly codebase for safe local use.

---

## 1. SSRF: Lock down the link-preview route — APPLIED

`app/api/link-preview/route.ts` fetches user-supplied URLs server-side. The existing `isPrivateUrl()` check only inspected hostname strings, which could be bypassed via DNS rebinding (e.g., a hostname that resolves to `127.0.0.1`).

**What was done:**

- Added `dns.promises.lookup()` to resolve hostnames before fetching and reject any IP in private ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`).
- The existing 50KB read limit and post-redirect `isPrivateUrl()` recheck were kept.

---

## 2. SSRF: Lock down the export media downloader — APPLIED

`lib/exporter.ts` had a `downloadFile(url)` function that fetched arbitrary URLs when building ZIP exports, with no URL validation.

**What was done:**

- Added an `isAllowedMediaUrl()` check that only permits `https://` URLs from `pbs.twimg.com`, `video.twimg.com`, `ton.twimg.com`, and `abs.twimg.com`.
- Disallowed URLs are skipped with a console warning.

---

## 3. CORS: Restrict the media proxy endpoint — APPLIED

`app/api/media/route.ts` had `Access-Control-Allow-Origin: *`, allowing any website to proxy media through the local server.

**What was done:**

- Replaced `*` with a `corsOrigin()` function that only allows `http://localhost` origins (any port).
- Added `Vary: Origin` header for correct caching.
- Note: `app/api/import/bookmarklet/route.ts` already had proper CORS restricted to `x.com` and `twitter.com` — no change needed.

---

## 4. Remove unnecessary OpenAI key collection — SKIPPED

The original recommendation assumed OpenAI keys were unused, but the app actively supports OpenAI as an AI provider (provider toggle in settings UI, Codex CLI integration, OpenAI model selection). Removing this would break functionality.

---

## 5. Disable live Twitter sync routes — APPLIED

The live sync routes (`app/api/import/live/`, `app/api/import/twitter/`) store raw Twitter session tokens in plaintext, giving full access to the user's account.

**What was done:**

- Added `ENABLE_LIVE_SYNC` feature flag (reads `process.env.ENABLE_LIVE_SYNC`).
- All POST and DELETE handlers in `app/api/import/live/route.ts`, `app/api/import/live/sync/route.ts`, and `app/api/import/twitter/route.ts` return 403 unless `ENABLE_LIVE_SYNC=true` is set.
- GET handler on `/api/import/live` left accessible (read-only status check).

---

## 6. Disable Cloudflare tunnel setup — APPLIED

`scripts/setup-tunnel.sh` and `start.sh` supported exposing the app via Cloudflare tunnel. Since there is no authentication on any API route, this would make everything publicly accessible.

**What was done:**

- Removed the tunnel auto-start block from `start.sh`.
- Added a security warning comment at the top of `start.sh`.
- Renamed `scripts/setup-tunnel.sh` to `scripts/setup-tunnel.sh.DISABLED`.

---

## 7. Sanitize user input in AI search prompts — APPLIED

`app/api/search/ai/route.ts` interpolated the raw user query directly into the Claude prompt string, enabling prompt injection.

**What was done:**

- Wrapped the query in `<user_query>` XML tags.
- Added an instruction telling Claude to treat the tag content as literal search text, not as instructions.

---

## 8. Fix hardcoded port in twitter-import page — N/A

The `app/twitter-import/` directory does not exist in the current codebase. This issue was either already resolved or the page was removed.

---

## 9. Audit for XSS in bookmark rendering — NO ACTION NEEDED

Searched all `components/` and `app/` files for `dangerouslySetInnerHTML`. The only instance is in `app/layout.tsx` for a hardcoded theme-initialization script (no user content). React's default JSX escaping handles all bookmark text rendering safely.

---

## 10. Store API keys via environment variables — APPLIED

**What was done:**

- Added a recommendation banner in the Settings UI (`app/settings/page.tsx`) advising users to set `ANTHROPIC_API_KEY` in `.env.local` instead of saving keys through the UI.

---

## Safe run procedure (one-time local import)

```bash
# 1. Clone and enter the repo
git clone https://github.com/viperrcrypto/Siftly.git
cd Siftly

# 2. Set your Anthropic key as an env var (not in the UI)
echo 'ANTHROPIC_API_KEY=sk-ant-api03-your-key-here' >> .env.local
echo 'DATABASE_URL="file:./prisma/dev.db"' >> .env.local

# 3. Install and set up
npm install
npx prisma generate
npx prisma db push

# 4. Start the dev server (localhost only, no tunnel)
npx next dev

# 5. Open http://localhost:3000
#    Go to Settings and switch the model to Haiku (cheapest)
#    Go to Import, use the bookmarklet method to export bookmarks.json from x.com
#    Upload bookmarks.json in Siftly
#    Wait for the AI pipeline to finish
#    Explore the mindmap

# 6. When done, stop the server with Ctrl+C
#    Optionally delete the repo and database:
#    cd .. && rm -rf Siftly
```

Do NOT:

- Run `scripts/setup-tunnel.sh`
- Set `CLOUDFLARE_TUNNEL_TOKEN` in your `.env`
- Enter Twitter session tokens (`auth_token` / `ct0`) anywhere in the app
- Save your Anthropic key through the Settings UI (use the env var instead)
- Expose port 3000 to your network (keep it localhost only)
