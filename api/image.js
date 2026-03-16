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

export default async function handler(req, res) {
    const { id, debug } = req.query;
    if (!id) return res.status(400).send("No ID");

    // Notice we are using ?size=400 as you brilliantly pointed out earlier!
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
            time_ms: 0
        };

        try {
            const start = Date.now();
            
            const response = await axios.get(targetUrl, {
                httpsAgent: agent,
                maxRedirects: 0, 
                responseType: 'arraybuffer',
                timeout: 5000, 
                validateStatus: () => true, 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*',
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
                if (response.status >= 300 && response.status <= 308 && response.headers.location) {
                    return res.redirect(302, response.headers.location);
                }
                if (response.status === 200) {
                    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
                    return res.status(200).send(Buffer.from(response.data));
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

    res.redirect(302, 'https://dummyimage.com/400x600/0f172a/ef4444.png&text=Proxy+Failed');
}
