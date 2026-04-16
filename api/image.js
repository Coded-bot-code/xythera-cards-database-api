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

// Detect content type by magic bytes
function detectMimeType(buffer) {
    if (buffer.length < 8) return 'application/octet-stream';

    // GIF: GIF87a or GIF89a
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return 'image/gif';
    }
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        return 'image/jpeg';
    }
    // MP4 / MOV — ftyp box at offset 4
    // Common: ftyp + mp42, isom, avc1, M4V, qt
    const ftyp = buffer.slice(4, 8).toString('ascii');
    if (ftyp === 'ftyp') return 'video/mp4';
    // Also check offset 0 for some mp4 variants
    const h0 = buffer.slice(0, 4).toString('hex');
    if (h0 === '00000018' || h0 === '00000020') {
        const box = buffer.slice(4, 8).toString('ascii');
        if (box === 'ftyp') return 'video/mp4';
    }
    // WebM / MKV
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
        return 'video/webm';
    }

    return null; // unknown
}

// Convert MP4 buffer → GIF buffer using ffmpeg
// High-quality palette-based conversion, capped at 15fps and 400px wide
async function mp4BufferToGif(mp4Buffer, id) {
    const tmp = tmpdir();
    const inputPath  = join(tmp, `xythera_in_${id}.mp4`);
    const palettePath = join(tmp, `xythera_pal_${id}.png`);
    const outputPath = join(tmp, `xythera_out_${id}.gif`);

    try {
        // Write MP4 to disk
        await writeFile(inputPath, mp4Buffer);

        // Step 1: Generate optimised palette from the video
        await execFileAsync('ffmpeg', [
            '-y',
            '-i', inputPath,
            '-vf', 'fps=12,scale=400:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff',
            palettePath
        ], { timeout: 25000 });

        // Step 2: Convert MP4 → GIF using the palette (dithering for quality)
        await execFileAsync('ffmpeg', [
            '-y',
            '-i', inputPath,
            '-i', palettePath,
            '-lavfi', 'fps=12,scale=400:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
            '-loop', '0',         // loop forever
            outputPath
        ], { timeout: 30000 });

        const gifBuffer = await readFile(outputPath);
        return gifBuffer;

    } finally {
        // Clean up temp files — don't await, fire & forget
        unlink(inputPath).catch(() => {});
        unlink(palettePath).catch(() => {});
        unlink(outputPath).catch(() => {});
    }
}

// Follow redirects manually to always get the final resource body
async function fetchWithRedirects(url, agent, maxRedirects = 5) {
    let currentUrl = url;

    for (let i = 0; i < maxRedirects; i++) {
        const response = await axios.get(currentUrl, {
            httpsAgent: agent,
            maxRedirects: 0,
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'video/mp4,image/gif,image/*,*/*;q=0.8',
                'Referer': 'https://shoob.gg/'
            }
        });

        if (response.status >= 300 && response.status <= 308 && response.headers.location) {
            currentUrl = response.headers.location;
            continue;
        }

        return response;
    }

    throw new Error('Too many redirects');
}

export default async function handler(req, res) {
    const { id, animated, debug } = req.query;
    if (!id) return res.status(400).send('No ID provided');

    // animated=true → Tier 6 or Tier S card — must be served as GIF
    const shouldBeGif = animated === 'true';

    const targetUrl = `https://api.shoob.gg/site/api/cardr/${id}?size=400`;
    let debugLogs = [];

    for (let attempt = 0; attempt < 3; attempt++) {
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        const agent = new HttpsProxyAgent(proxy);

        const log = {
            attempt: attempt + 1,
            proxy_ip: proxy.split('@')[1],
            status: null,
            mime: null,
            converted_to_gif: false,
            error: null,
            time_ms: 0
        };

        try {
            const t0 = Date.now();
            const response = await fetchWithRedirects(targetUrl, agent);
            log.time_ms = Date.now() - t0;
            log.status = response.status;

            if (debug !== 'true' && response.status === 200) {
                const buffer = Buffer.from(response.data);
                const mime = detectMimeType(buffer) || response.headers['content-type'] || 'image/png';
                log.mime = mime;

                res.setHeader('Access-Control-Allow-Origin', '*');

                // --- Case 1: Source is MP4 and this is an animated tier card → convert to GIF ---
                if (shouldBeGif && (mime === 'video/mp4' || mime === 'video/webm')) {
                    try {
                        const gifBuffer = await mp4BufferToGif(buffer, id);
                        log.converted_to_gif = true;
                        debugLogs.push(log);

                        res.setHeader('Content-Type', 'image/gif');
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        res.setHeader('X-Is-Animated', 'true');
                        res.setHeader('X-Source-Mime', mime);
                        return res.status(200).send(gifBuffer);

                    } catch (ffmpegErr) {
                        // ffmpeg failed — fall through to return raw video so at least something shows
                        log.error = `ffmpeg_failed: ${ffmpegErr.message}`;
                        debugLogs.push(log);

                        res.setHeader('Content-Type', mime);
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('X-Is-Animated', 'true');
                        res.setHeader('X-Ffmpeg-Error', 'conversion_failed');
                        return res.status(200).send(buffer);
                    }
                }

                // --- Case 2: Source is already a GIF ---
                if (mime === 'image/gif') {
                    debugLogs.push(log);
                    res.setHeader('Content-Type', 'image/gif');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    res.setHeader('X-Is-Animated', 'true');
                    return res.status(200).send(buffer);
                }

                // --- Case 3: Normal static image (PNG/JPEG) ---
                debugLogs.push(log);
                res.setHeader('Content-Type', mime);
                res.setHeader('Cache-Control', 'public, max-age=31536000');
                res.setHeader('X-Is-Animated', 'false');
                return res.status(200).send(buffer);
            }

            debugLogs.push(log);

        } catch (err) {
            log.error = err.code || err.message;
            debugLogs.push(log);
        }
    }

    if (debug === 'true') {
        return res.status(200).json({
            message: 'Diagnostics Complete',
            target_url: targetUrl,
            should_be_gif: shouldBeGif,
            logs: debugLogs
        });
    }

    // Fallback placeholder SVG
    const svg = `<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="600" fill="#0f172a"/>
        <rect x="50" y="250" width="300" height="60" rx="5" fill="#1e293b"/>
        <text x="200" y="275" font-family="Arial" font-size="14" fill="#64748b" text-anchor="middle">Failed to Load</text>
        <text x="200" y="298" font-family="Arial" font-size="10" fill="#475569" text-anchor="middle">Card Image Unavailable</text>
    </svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(Buffer.from(svg));
}
