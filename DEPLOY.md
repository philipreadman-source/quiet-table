# Deploy — GitHub + Vercel (Hobby)

Quiet Table is a Next.js app. **GitHub** holds the code; **Vercel** hosts the live site. Both free tiers are enough for the friends beta.

## Prerequisites

- [GitHub](https://github.com) account
- [Vercel](https://vercel.com) account (Hobby / personal)
- Node 20+ locally

## 1. Push to GitHub

From the project root:

```bash
cd "/Users/philipreadman/Documents/Claude-Code/quiet table"

# Create a private repo on github.com named `quiet-table`, then:
git remote add origin git@github.com:YOUR_GITHUB_USER/quiet-table.git
git push -u origin main
```

**Or** with [GitHub CLI](https://cli.github.com/) after `gh auth login`:

```bash
gh repo create quiet-table --private --source=. --remote=origin --push
```

`.env.local` is gitignored — never commit secrets.

## 2. Import on Vercel

1. Open [vercel.com/new](https://vercel.com/new)
2. **Import** your `quiet-table` GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Build command: `npm run build` (default)
5. Install command: `npm install` (default)
6. Deploy

Every push to `main` → production deploy. Pull requests → preview URLs (optional).

## 3. Environment variables (Vercel dashboard)

| Variable | Required | Notes |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | No | Only if live agent is on; fallback works without it |
| `BETA_ACCESS_TOKEN` | Soon | Random string for private beta URL gate |

Copy names from `.env.example`. Apply to **Production** and **Preview**.

## 4. Private beta URL (when gate ships)

Share only:

`https://YOUR_PROJECT.vercel.app/beta/YOUR_BETA_ACCESS_TOKEN`

Invite links (later): `https://YOUR_PROJECT.vercel.app/join?ref={userId}`

## 5. Verify

- Production URL loads the intent cards
- `/api/agent` returns JSON (POST from the app after wizard)
- Check **Vercel → Deployments → Build logs** if build fails

## Local dev

```bash
npm install
cp .env.example .env.local   # add keys as needed
npm run dev -- --port 3003
```

## Cost notes

- GitHub private repo: free
- Vercel Hobby: free for personal projects; serverless limits are fine for a small friend group
- Upgrade to Vercel Pro only if you hit limits or need team features
