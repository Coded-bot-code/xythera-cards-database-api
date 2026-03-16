export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) return res.status(400).send("No URL provided");

    try {
        // Spoof Discord Bot headers to bypass Shoob's firewall
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            }
        });

        if (!response.ok) throw new Error("Failed to fetch image from Shoob");

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400"); // Cache for 24 hours
        res.setHeader("Content-Type", response.headers.get("content-type") || "image/webp");
        res.send(buffer);

    } catch (error) {
        console.error("Proxy Error:", error);
        // Returns a tiny transparent pixel if it fails so the UI doesn't break
        const fallback = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
        res.setHeader("Content-Type", "image/png");
        res.send(fallback);
    }
}
