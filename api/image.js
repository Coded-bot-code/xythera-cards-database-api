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

// Detect if URL points to a GIF
function isGifUrl(url) {
    return url?.toLowerCase().includes('.gif') || url?.toLowerCase().includes('gif?');
}

export default async function handler(req, res) {
    const { id, debug } = req.query;
    if (!id) return res.status(400).send("No ID");

    // Shoob API - this returns the card image (could be PNG or GIF)
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
            is_gif: false
        };

        try {
            const start = Date.now();

            const response = await axios.get(targetUrl, {
                httpsAgent: agent,
                maxRedirects: 0, 
                responseType: 'arraybuffer',
                timeout: 8000, // Increased timeout for GIFs
                validateStatus: () => true, 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/webp,image/apng,image/gif,image/*,*/*;q=0.8', // Accept GIFs
                    'Referer': 'https://shoob.gg/'
                }
            });

            attemptLog.time_ms = Date.now() - start;
            attemptLog.status = response.status;

            if (response.headers.location) {
                attemptLog.redirect_url = response.headers.location;
            }

            debugLogs.push(attemptLog);

            if (debug !== 'true') {
                // Handle redirects
                if (response.status >= 300 && response.status <= 308 && response.headers.location) {
                    return res.redirect(302, response.headers.location);
                }
                
                if (response.status === 200) {
                    const buffer = Buffer.from(response.data);
                    const contentType = response.headers['content-type'] || 'image/png';
                    
                    // Check if it's a GIF by magic bytes
                    const isGif = buffer.length > 6 && 
                                 buffer[0] === 0x47 && buffer[1] === 0x49 && 
                                 buffer[2] === 0x46 && buffer[3] === 0x38;
                    
                    attemptLog.is_gif = isGif;
                    
                    // Set proper content type
                    if (isGif) {
                        res.setHeader('Content-Type', 'image/gif');
                        res.setHeader('Cache-Control', 'public, max-age=31536000');
                    } else {
                        res.setHeader('Content-Type', contentType);
                    }
                    
                    return res.status(200).send(buffer);
                }
            }

        } catch (err) {
            attemptLog.error = err.code || err.message;
            debugLogs.push(attemptLog);
        }
    }

    if (debug === 'true') {
        return res.status(200).json({
            message: "Diagnostics Complete",
            target_url: targetUrl,
            logs: debugLogs
        });
    }

    // Fallback - return a proper placeholder
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(Buffer.from(getPlaceholderImage()));
}

// Base64 encoded placeholder image (400x600 dark card)
function getPlaceholderImage() {
    const svg = `<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="600" fill="#0f172a"/>
        <rect x="50" y="250" width="300" height="40" rx="5" fill="#1e293b"/>
        <text x="200" y="275" font-family="Arial" font-size="14" fill="#64748b" text-anchor="middle">⚠️ Failed to Load</text>
        <text x="200" y="295" font-family="Arial" font-size="10" fill="#475569" text-anchor="middle">Card Image Unavailable</text>
    </svg>`;
    return Buffer.from(svg);
}