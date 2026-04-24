# Cutroom FFmpeg Worker — Ready to Deploy

This is the video processing worker for your Cutroom app.
It receives cut/clip requests, runs ffmpeg, and uploads results back to your Lovable Cloud storage.

## ⚡ Deploy to Railway (recommended, ~5 min)

### 1. Push this folder to a GitHub repo
```bash
cd cutroom-worker
git init && git add . && git commit -m "init"
gh repo create cutroom-worker --private --source=. --push
# OR manually create a repo on github.com and push
```

### 2. Deploy on Railway
1. Go to https://railway.app/new
2. Click **Deploy from GitHub repo** → pick `cutroom-worker`
3. Railway auto-detects the `Dockerfile` and starts building
4. Once built, click **Settings → Networking → Generate Domain**
   → you'll get a URL like `https://cutroom-worker-production.up.railway.app`

### 3. Add environment variables (Railway → Variables tab)

Copy-paste these EXACTLY:

```
SUPABASE_URL=https://hvzfpncbhvstzqdpscmk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste from Lovable Cloud → Backend → API keys → service_role>
WORKER_SECRET=c026550dbd26de2ca8a2fc337f8d00a1c1591d478b3a47f73ae1329a48320929
```

⚠️ The `service_role` key is secret — get it from your Lovable app:
   Project → Cloud → Backend → API keys → reveal & copy `service_role`

### 4. Wire it into your Cutroom app
In your Cutroom app, go to **Settings page** and paste:
- **Worker URL**: the Railway URL from step 2
- **Worker Secret**: `c026550dbd26de2ca8a2fc337f8d00a1c1591d478b3a47f73ae1329a48320929`
  (must match the `WORKER_SECRET` you set on Railway)

Done. Upload a video in your app and it'll process.

---

## Alternative: Deploy to Render

1. https://render.com → **New → Web Service**
2. Connect the GitHub repo
3. Choose **Docker** runtime, plan: **Starter ($7/mo)** for always-on
4. Add the 3 env vars above
5. Deploy → copy the public URL → paste into your Cutroom app's Settings

---

## Test it works

After deploy, hit the root URL in your browser:
```
https://your-worker-url.up.railway.app/
```
Should return: `{"ok":true,"name":"cutroom-worker"}`

## Troubleshooting

- **502 / build fails**: Check Railway logs. Most often missing env vars.
- **`unauthorized` errors**: `WORKER_SECRET` on Railway ≠ `Worker Secret` in your app's Settings.
- **Upload fails**: `SUPABASE_SERVICE_ROLE_KEY` is wrong or missing. Must be the `service_role` key, NOT the `anon` key.
- **ffmpeg errors**: usually means the source video URL isn't publicly fetchable. Check your `videos` storage bucket is public.
