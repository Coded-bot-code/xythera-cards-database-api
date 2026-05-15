import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const proxies = [
    "http://daknlrlb:sfpf7jrfkxta@31.59.20.176:6754",
    "http://daknlrlb:sfpf7jrfkxta@23.95.150.145:6114",
    "http://daknlrlb:sfpf7jrfkxta@198.23.239.134:6540",
    "http://daknlrlb:sfpf7jrfkxta@45.38.107.97:6014",
    "http://daknlrlb:sfpf7jrfkxta@107.172.163.27:6543",
    "http://daknlrlb:sfpf7jrfkxta@198.105.121.200:6462",
    "http://daknlrlb:sfpf7jrfkxta@64.137.96.74:6641",
    "http://daknlrlb:sfpf7jrfkxta@216.10.27.159:6837",
    "http://daknlrlb:sfpf7jrfkxta@142.111.67.146:5611",
    "http://daknlrlb:sfpf7jrfkxta@191.96.254.138:6185"
];

// ─── Magic-byte detection ──────────────────────────────────────────────────────

function detectMime(buf) {
    if (buf.length < 12) return 'application/octet-stream';

    // GIF87a / GIF89a
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
        return 'image/gif';

    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)
        return 'image/png';

    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8)
        return 'image/jpeg';

    // WebP — RIFF????WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
        return 'image/webp';

    // MP4 — ftyp box at offset 4
    const ftyp = buf.slice(4, 8).toString('ascii');
    if (ftyp === 'ftyp') return 'video/mp4';

    // WebM / MKV
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3)
        return 'video/webm';

    return null;
}

/**
 * Animated WebP detection.
 * Layout: RIFF (4) + size (4) + WEBP (4) + chunk-FourCC (4) + chunk-size (4) + flags (1)
 * chunk-FourCC == "VP8X" and flags byte (offset 20) has bit 1 (0x02) set → animated.
 */
function isAnimatedWebP(buf) {
    if (buf.length < 21) return false;
    const isWebP =
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    if (!isWebP) return false;

    const fourCC = buf.slice(12, 16).toString('ascii');
    if (fourCC !== 'VP8X') return false;

    // Flags byte is at offset 20; bit 1 (value 0x02) = ANIMATION flag
    return (buf[20] & 0x02) !== 0;
}

// ─── Animated WebP → GIF conversion via ffmpeg ────────────────────────────────

async function animatedWebPToGif(webpBuf, id) {
    const tmp = tmpdir();
    const inPath  = join(tmp, `sh_in_${id}.webp`);
    const palPath = join(tmp, `sh_pal_${id}.png`);
    const outPath = join(tmp, `sh_out_${id}.gif`);

    try {
        await writeFile(inPath, webpBuf);

        // Pass 1 – generate optimised palette
        await execFileAsync('ffmpeg', [
            '-y', '-i', inPath,
            '-vf', 'fps=15,scale=400:-1:flags=lanczos,palettegen=max_colors=256:stats_mode=diff',
            palPath
        ], { timeout: 25000 });

        // Pass 2 – render GIF using palette with Bayer dithering
        await execFileAsync('ffmpeg', [
            '-y', '-i', inPath, '-i', palPath,
            '-lavfi', 'fps=15,scale=400:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
            '-loop', '0',
            outPath
        ], { timeout: 35000 });

        return await readFile(outPath);
    } finally {
        unlink(inPath).catch(() => {});
        unlink(palPath).catch(() => {});
        unlink(outPath).catch(() => {});
    }
}

// ─── MP4 → GIF conversion via ffmpeg (fallback if shoob ever returns MP4) ─────

async function mp4ToGif(mp4Buf, id) {
    const tmp = tmpdir();
    const inPath  = join(tmp, `sh_mp4_${id}.mp4`);
    const palPath = join(tmp, `sh_mp4pal_${id}.png`);
    const outPath = join(tmp, `sh_mp4out_${id}.gif`);

    try {
        await writeFile(inPath, mp4Buf);

        await execFileAsync('ffmpeg', [
            '-y', '-i', inPath,
            '-vf', 'fps=15,scale=400:-1:flags=lanczos,palettegen=max_colors=256:stats_mode=diff',
            palPath
        ], { timeout: 25000 });

        await execFileAsync('ffmpeg', [
            '-y', '-i', inPath, '-i', palPath,
            '-lavfi', 'fps=15,scale=400:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
            '-loop', '0',
            outPath
        ], { timeout: 35000 });

        return await readFile(outPath);
    } finally {
        unlink(inPath).catch(() => {});
        unlink(palPath).catch(() => {});
        unlink(outPath).catch(() => {});
    }
}

// ─── Fetch helper: follows redirects server-side, returns final buffer ─────────
//
// Why manual redirect following instead of axios maxRedirects?
// The shoob API redirects to cdn.shoob.gg which requires a Referer header.
// We must keep that header through the redirect chain ourselves.

async function fetchFollowingRedirects(startUrl, agent, maxHops = 6) {
    let url = startUrl;

    for (let hop = 0; hop < maxHops; hop++) {
        const resp = await axios.get(url, {
            httpsAgent: agent,
            maxRedirects: 0,           // We handle redirects manually
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/webp,image/gif,image/apng,image/*,video/*,*/*;q=0.8',
                'Referer': 'https://shoob.gg/'
            }
        });

        if (resp.status >= 300 && resp.status <= 308) {
            const location = resp.headers.location;
            if (!location) throw new Error('Redirect with no Location header');
            // Handle relative redirects
            url = location.startsWith('http') ? location : new URL(location, url).href;
            continue;
        }

        // Log the final URL for debugging
        resp._finalUrl = url;
        return resp;
    }

    throw new Error('Too many redirects');
}

// ─── Fallback SVG placeholder ─────────────────────────────────────────────────

function placeholderSvg() {
    return Buffer.from(`<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="600" fill="#0f172a"/>
        <rect x="50" y="250" width="300" height="60" rx="5" fill="#1e293b"/>
        <text x="200" y="275" font-family="Arial" font-size="14" fill="#64748b" text-anchor="middle">Failed to Load</text>
        <text x="200" y="298" font-family="Arial" font-size="10" fill="#475569" text-anchor="middle">Card Image Unavailable</text>
    </svg>`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const { id, animated, debug } = req.query;
    if (!id) return res.status(400).send('Missing id parameter');

    // animated=true means this is a Tier 6 or Tier S card —
    // shoob serves these as animated WebP; we convert to GIF.
    const wantGif = animated === 'true';

    // The shoob /cardr/ endpoint redirects to the real CDN URL.
    // We follow the redirect server-side so we keep control over headers
    // and can stream the final bytes back ourselves.
    const shoobUrl = `https://api.shoob.gg/site/api/cardr/${id}?size=400`;

    const logs = [];

    for (let attempt = 0; attempt < 3; attempt++) {
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        const agent = new HttpsProxyAgent(proxy);
        const log = { attempt: attempt + 1, proxy_ip: proxy.split('@')[1], status: null, mime: null, final_url: null, converted: false, error: null, ms: 0 };

        try {
            const t0 = Date.now();
            const resp = await fetchFollowingRedirects(shoobUrl, agent);
            log.ms = Date.now() - t0;
            log.status = resp.status;
            log.final_url = resp._finalUrl;

            if (debug !== 'true' && resp.status === 200) {
                const raw = Buffer.from(resp.data);
                const mime = detectMime(raw) || resp.headers['content-type'] || 'image/webp';
                log.mime = mime;

                res.setHeader('Access-Control-Allow-Origin', '*');

                // ── Animated WebP (Tier S / Tier 6) ─────────────────────────
                if (wantGif && mime === 'image/webp' && isAnimatedWebP(raw)) {
                    try {
                        const gif = await animatedWebPToGif(raw, id);
                        log.converted = true;
                        logs.push(log);
                        res.setHeader('Content-Type', 'image/gif');
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        res.setHeader('X-Is-Animated', 'true');
                        res.setHeader('X-Source-Format', 'animated-webp');
                        return res.status(200).send(gif);
                    } catch (e) {
                        log.error = `webp→gif failed: ${e.message}`;
                        // Fall through — serve raw WebP at least
                    }
                }

                // ── Static WebP that we're asked to serve as GIF (edge case):
                // wantGif=true but WebP is not actually animated — just serve it
                // as WebP; the browser handles static WebP fine in an <img> tag.

                // ── MP4 fallback (in case shoob ever changes format) ─────────
                if (wantGif && (mime === 'video/mp4' || mime === 'video/webm')) {
                    try {
                        const gif = await mp4ToGif(raw, id);
                        log.converted = true;
                        logs.push(log);
                        res.setHeader('Content-Type', 'image/gif');
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        res.setHeader('X-Is-Animated', 'true');
                        res.setHeader('X-Source-Format', mime);
                        return res.status(200).send(gif);
                    } catch (e) {
                        log.error = `mp4→gif failed: ${e.message}`;
                    }
                }

                // ── Already a GIF ────────────────────────────────────────────
                if (mime === 'image/gif') {
                    logs.push(log);
                    res.setHeader('Content-Type', 'image/gif');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    res.setHeader('X-Is-Animated', 'true');
                    return res.status(200).send(raw);
                }

                // ── Static image (PNG / JPEG / non-animated WebP) ────────────
                logs.push(log);
                res.setHeader('Content-Type', mime);
                res.setHeader('Cache-Control', 'public, max-age=31536000');
                res.setHeader('X-Is-Animated', 'false');
                return res.status(200).send(raw);
            }

            logs.push(log);

        } catch (err) {
            log.error = err.code || err.message;
            logs.push(log);
        }
    }

    if (debug === 'true') {
        return res.status(200).json({ shoob_url: shoobUrl, want_gif: wantGif, logs });
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(placeholderSvg());
}
