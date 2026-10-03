// Deterministic shot-aware MP4 export. The edit, captions and score share one plan.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { dirname, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { foleyCues, synthSfx } from './trailer-audio.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
  args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const opt = {
  clip: args.clip ?? 'journey', out: resolve(root, args.out ?? 'trailer/acima-da-nevoa-trailer-v4.mp4'),
  width: +(args.width ?? 1920), height: +(args.height ?? 1080), fps: +(args.fps ?? 60), crf: +(args.crf ?? 18),
  from: +(args.from ?? 0), to: args.to === undefined ? null : +args.to,
  review: !!args.review, music: args['no-music'] ? false : args.music,
};
for (const k of ['width', 'height', 'fps', 'crf', 'from']) if (!Number.isFinite(opt[k])) throw new Error(`Invalid --${k}`);
if (opt.width < 320 || opt.height < 180 || opt.width % 2 || opt.height % 2) throw new Error('Dimensions must be positive even integers, at least 320x180');
if (![30, 60].includes(opt.fps)) throw new Error('--fps must be 30 or 60 (simulation always runs at 60 Hz)');
if (opt.from < 0 || (opt.to !== null && !Number.isFinite(opt.to))) throw new Error('Invalid time range');
const paths = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const executablePath = paths.find(p => p && existsSync(p));
if (!executablePath) throw new Error('Set CHROME_PATH to Chrome or Edge');
mkdirSync(dirname(opt.out), { recursive: true });
const stem = resolve(dirname(opt.out), parse(opt.out).name);
const reviewDir = resolve(dirname(opt.out), 'review-v4');
const picture = `${stem}-picture.mp4`;
if (opt.review) mkdirSync(reviewDir, { recursive: true });

function runFF(argv, pipe = false) {
  const proc = spawn(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...argv], { stdio: [pipe ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { proc.on('error', rej); proc.on('exit', c => c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`))); });
  // Register immediately so early encoder failure cannot become an unhandled rejection.
  done.catch(() => {});
  return { proc, done };
}
async function score(plan) {
  if (opt.music === false) return null;
  const cues = typeof opt.music === 'string'
    ? [{ file: opt.music, at: 0, to: plan.dur, offset: 0, gain: 0.8, fadeIn: 2, fadeOut: 3 }]
    : plan.audio;
  if (!cues.length) return null;
  synthSfx(root, ffmpegPath);
  const inputs = [], filters = [];
  cues.forEach((c, i) => {
    const path = resolve(root, c.file), len = c.to - c.at;
    if (!existsSync(path)) throw new Error(`Missing score asset: ${path}`);
    if (len <= 0 || c.at < 0 || c.to > plan.dur + 0.001) throw new Error(`Invalid music cue: ${c.file}`);
    inputs.push('-ss', String(c.offset ?? 0), '-t', String(len), '-i', path);
    const fi = Math.min(c.fadeIn ?? 0.5, len / 2), fo = Math.min(c.fadeOut ?? 1, len / 2);
    filters.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${c.gain ?? 1},afade=t=in:st=0:d=${fi},afade=t=out:st=${len - fo}:d=${fo},adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[a${i}]`);
  });
  filters.push(`${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:duration=longest:normalize=0,apad,atrim=duration=${plan.dur}[mix]`);
  const path = `${stem}-score.wav`, raw = `${stem}-raw.wav`, graph = `${stem}-audio.ffgraph`;
  writeFileSync(graph, filters.join(';'));
  try { await runFF([...inputs, '-filter_complex_threads', '1', '-filter_complex_script', graph, '-map', '[mix]', '-c:a', 'pcm_f32le', raw]).done; }
  finally { unlinkSync(graph); }
  // One static gain to -16 LUFS plus a peak limiter: unlike a single-pass loudnorm this keeps the mix's dynamics,
  // so the climax stays louder than the lull before it.
  const meter = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', raw, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = +(/I:\s+(-?[\d.]+) LUFS/.exec(meter.stderr.split('Summary:').pop()) ?? [])[1];
  if (!Number.isFinite(I)) throw new Error('Could not measure the score loudness');
  try { await runFF(['-i', raw, '-af', `volume=${(-16 - I).toFixed(2)}dB,alimiter=limit=0.84:level=0:attack=3:release=80,afade=t=out:st=${plan.dur - 1.5}:d=1.5`, '-c:a', 'pcm_s16le', path]).done; }
  finally { unlinkSync(raw); }
  return path;
}
if (args['score-only']) {
  const plan = JSON.parse(readFileSync(`${stem}-plan.json`, 'utf8'));
  console.log(`Score: ${await score(plan)}`);
  process.exit(0);
}
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
let browser, encoder;
try {
  await server.listen();
  console.log('Launching trailer browser...');
  browser = await puppeteer.launch({ executablePath, headless: true,
    timeout: 120000,
    defaultViewport: { width: opt.width, height: opt.height, deviceScaleFactor: 1 },
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars', '--mute-audio'],
  });
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000);
  page.on('console', m => { if (m.type() === 'error') console.error('Browser:', m.text()); });
  page.on('pageerror', e => { errors.push(e.message); console.error('Page error:', e.message); });
  console.log('Loading game...');
  await page.goto(`http://localhost:${server.config.server.port}/?trailer=${encodeURIComponent(opt.clip)}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__trailer', { timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  const plan = await page.evaluate(() => window.__trailer.plan());
  if (plan.shots.some(s => s.dissolve)) throw new Error('Use in-shot fades for this renderer; overlapping dissolves require independent shot passes');
  const end = Math.min(opt.to ?? plan.dur, plan.dur), len = end - opt.from;
  if (len <= 0) throw new Error('--from must be before --to and the trailer end');
  const savePlan = () => writeFileSync(`${stem}-plan.json`, JSON.stringify({ ...plan, export: { ...opt, duration: len } }, null, 2));
  savePlan();
  console.log(`${opt.clip}: ${plan.dur.toFixed(1)}s, ${plan.shots.length} shots; exporting ${len.toFixed(1)}s at ${opt.width}x${opt.height}@${opt.fps}`);
  if (!opt.review) {
    const input = ['-f', 'image2pipe', '-framerate', String(opt.fps), '-c:v', 'mjpeg', '-i', '-'];
    encoder = runFF([...input, '-map', '0:v', '-c:v', 'libx264', '-preset', 'fast', '-crf', String(opt.crf), '-pix_fmt', 'yuv420p', '-t', String(len), '-movflags', '+faststart', picture], true);
    encoder.proc.stdin.on('error', () => {});
  }
  const started = Date.now(), substeps = 60 / opt.fps;
  let written = 0;
  for (let s = 0; s < plan.shots.length; s++) {
    const shot = plan.shots[s];
    if (shot.at >= end) break;
    await page.evaluate(i => window.__trailer.begin(i), s);
    const frames = Math.round(shot.dur * opt.fps);
    const samples = new Set([Math.floor(frames * 0.15), Math.floor(frames * 0.5), Math.floor(frames * 0.85)]);
    console.log(`Shot ${s + 1}/${plan.shots.length}: ${shot.name}`);
    for (let f = 0; f < frames; f++) {
      const t = shot.at + f / opt.fps;
      if (t >= end - 1e-6) break;
      const capture = t >= opt.from - 1e-6 && (!opt.review || samples.has(f));
      await page.evaluate(({ n, quick }) => { window.__trailer.setQuick(quick); for (let j = 0; j < n; j++) window.__trailer.step(); }, { n: substeps, quick: !capture });
      if (errors.length) throw new Error(errors.join('\n'));
      if (!capture) continue;
      if (opt.review) {
        await page.screenshot({ path: resolve(reviewDir, `${String(s + 1).padStart(2, '0')}-${shot.name}-${Math.round(f / frames * 100)}.jpg`), type: 'jpeg', quality: 88 });
      } else {
        const jpg = await page.screenshot({ type: 'jpeg', quality: 94, optimizeForSpeed: true });
        if (encoder.proc.exitCode !== null) throw new Error('Encoder stopped before the final frame');
        if (!encoder.proc.stdin.write(jpg)) await new Promise((res, rej) => {
          const cleanup = () => { encoder.proc.stdin.off('drain', onDrain); encoder.proc.stdin.off('error', onError); };
          const onDrain = () => { cleanup(); res(); };
          const onError = e => { cleanup(); rej(e); };
          encoder.proc.stdin.once('drain', onDrain); encoder.proc.stdin.once('error', onError);
        });
        written++;
        if (written % 180 === 0) console.log(`Rendered ${(written / opt.fps).toFixed(1)}s / ${len.toFixed(1)}s (${(written / ((Date.now() - started) / 1000)).toFixed(1)} frames/s)`);
      }
    }
  }
  if (encoder) { encoder.proc.stdin.end(); await encoder.done; }
  const sounds = await page.evaluate(() => window.__trailer.sounds());
  plan.soundEvents = sounds;
  plan.audio.push(...foleyCues(sounds, plan.dur));
  savePlan();
  if (!opt.review) {
    console.log(`Mixing ${sounds.length} synchronized sound events...`);
    const music = await score(plan);
    await runFF(['-i', picture, ...(music ? ['-ss', String(opt.from), '-i', music] : []), '-map', '0:v', '-c:v', 'copy',
      ...(music ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] : []), '-t', String(len), '-movflags', '+faststart', opt.out]).done;
    unlinkSync(picture);
  }
  console.log(`Done: ${opt.review ? reviewDir : opt.out} (${Math.round((Date.now() - started) / 1000)}s)`);
} finally {
  if (encoder && encoder.proc.exitCode === null) encoder.proc.kill();
  await browser?.close();
  await server.close();
}
