import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

// Detect GIF by magic bytes (GIF87a = 0x474946383761, GIF89a = 0x474946383961)
function isGifBuffer(buffer) {
    return (
        buffer.length > 6 &&
        buffer[0] === 0x47 && // G
        buffer[1] === 0x49 && // I
        buffer[2] === 0x46 && // F
        buffer[3] === 0x38    // 8
    );
}

// Follow redirects manually so we capture the final GIF buffer instead of getting a redirect response
async function fetchWithRedirects(url, agent, maxRedirects = 5) {
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount < maxRedirects) {
        const response = await axios.get(currentUrl, {
            httpsAgent: agent,
            maxRedirects: 0,
            responseType: 'arraybuffer',
            timeout: 12000,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/gif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': 'https://shoob.gg/'
            }
        });

        if (response.status >= 300 && response.status <= 308 && response.headers.location) {
            currentUrl = response.headers.location;
            redirectCount++;
            continue;
        }

        return response;
    }

    throw new Error('Too many redirects');
}

export default async function handler(req, res) {
    const { id, animated, debug } = req.query;
    if (!id) return res.status(400).send("No ID");

    // animated=true is forwarded from card.js for Tier 6 and Tier S cards
    const isAnimatedTier = animated === 'true';

    const targetUrl = `https://api.shoob.gg/site/api/cardr/${id}?size=400`;
    let debugLogs = [];

    for (let i = 0; i < 3; i++) {
        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        const agent = new HttpsProxyAgent(randomProxy);

        let attemptLog = {
            attempt: i + 1,
            proxy_ip: randomProxy.split('@')[1],
            status: null,
            error: null,
            time_ms: 0,
            is_gif: false,
            is_animated_tier: isAnimatedTier
        };

        try {
            const start = Date.now();

            // Follow redirects so GIFs behind CDN redirects are fetched correctly
            const response = await fetchWithRedirects(targetUrl, agent);

            attemptLog.time_ms = Date.now() - start;
            attemptLog.status = response.status;

            if (debug !== 'true' && response.status === 200) {
                const buffer = Buffer.from(response.data);

                // Magic-byte detection is always authoritative; fall back to tier flag
                const gifByMagic = isGifBuffer(buffer);
                const isGif = gifByMagic || isAnimatedTier;

                attemptLog.is_gif = isGif;
                debugLogs.push(attemptLog);

                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('X-Is-Animated', isGif ? 'true' : 'false');

                if (isGif) {
                    res.setHeader('Content-Type', 'image/gif');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                } else {
                    const contentType = response.headers['content-type'] || 'image/png';
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Cache-Control', 'public, max-age=31536000');
                }

                return res.status(200).send(buffer);
            }

            debugLogs.push(attemptLog);

        } catch (err) {
            attemptLog.error = err.code || err.message;
            debugLogs.push(attemptLog);
        }
    }

    if (debug === 'true') {
        return res.status(200).json({
            message: "Diagnostics Complete",
            target_url: targetUrl,
            is_animated_tier: isAnimatedTier,
            logs: debugLogs
        });
    }

    // Fallback placeholder
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
