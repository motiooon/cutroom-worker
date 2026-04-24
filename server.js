// Cutroom FFmpeg worker — deploy on Render or Railway.
// Required ENV:
//   PORT                       (Render sets automatically)
//   SUPABASE_URL               (from Lovable Cloud → Project settings)
//   SUPABASE_SERVICE_ROLE_KEY  (from Lovable Cloud → Project settings, server-only!)
//   WORKER_SECRET              (optional shared secret — match VIDEO_WORKER_SECRET in your app)
//
// Endpoints:
//   POST /render-cleaned  { projectId, inputUrl, keeps:[{start,end}], uploadBucket, uploadPath }
//   POST /render-clip     { clipId, inputUrl, start, end, uploadBucket, uploadPath }
//
// Render: New Web Service → Docker (use Node 20) → these env vars → command `npm start`

import express from "express";
import ffmpeg from "fluent-ffmpeg";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const app = express();
app.use(express.json({ limit: "5mb" }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function checkAuth(req, res) {
  if (!process.env.WORKER_SECRET) return true;
  const h = req.headers.authorization ?? "";
  if (h !== `Bearer ${process.env.WORKER_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

async function downloadTo(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
}

async function uploadFile(bucket, path, filePath, contentType = "video/mp4") {
  const buf = await fs.readFile(filePath);
  const { error } = await supabase.storage.from(bucket).upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function ffmpegCut(input, start, duration, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions(["-c:v libx264", "-c:a aac", "-preset veryfast", "-movflags +faststart"])
      .output(output)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

function concatFiles(listFile, output) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy", "-movflags +faststart"])
      .output(output)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

app.post("/render-cleaned", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { projectId, inputUrl, keeps, uploadBucket, uploadPath } = req.body ?? {};
  if (!inputUrl || !Array.isArray(keeps) || keeps.length === 0)
    return res.status(400).json({ error: "missing inputUrl/keeps" });

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "cutroom-"));
  try {
    const src = path.join(work, "src.mp4");
    await downloadTo(inputUrl, src);
    const parts = [];
    for (let i = 0; i < keeps.length; i++) {
      const k = keeps[i];
      const out = path.join(work, `p${i}.mp4`);
      await ffmpegCut(src, k.start, Math.max(0.05, k.end - k.start), out);
      parts.push(out);
    }
    const list = path.join(work, "list.txt");
    await fs.writeFile(list, parts.map((p) => `file '${p}'`).join("\n"));
    const final = path.join(work, "final.mp4");
    await concatFiles(list, final);
    const url = await uploadFile(uploadBucket, uploadPath, final);
    res.json({ ok: true, url, path: uploadPath, projectId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message ?? e) });
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});

app.post("/render-clip", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { clipId, inputUrl, start, end, uploadBucket, uploadPath } = req.body ?? {};
  if (!inputUrl || start == null || end == null)
    return res.status(400).json({ error: "missing inputUrl/start/end" });

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "cutroom-clip-"));
  try {
    const src = path.join(work, "src.mp4");
    await downloadTo(inputUrl, src);
    const out = path.join(work, "clip.mp4");
    await ffmpegCut(src, start, Math.max(0.1, end - start), out);
    const url = await uploadFile(uploadBucket, uploadPath, out);
    res.json({ ok: true, url, path: uploadPath, clipId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message ?? e) });
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});

app.get("/", (_req, res) => res.json({ ok: true, name: "cutroom-worker" }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`cutroom-worker listening on :${port}`));
