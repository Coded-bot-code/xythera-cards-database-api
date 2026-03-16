const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
    const { key, random, id } = req.query;
    
    // Auth Check
    if (key !== 'SILENT_TECH_2026') {
        return res.status(401).json({ error: "Unauthorized API Key" });
    }

    try {
        // Load your 13-hour database
        const dbPath = path.join(process.cwd(), 'master_database.json');
        const rawData = fs.readFileSync(dbPath, 'utf8');
        const cards = JSON.parse(rawData);

        let selectedCard = null;

        // Pick card
        if (random === 'true') {
            selectedCard = cards[Math.floor(Math.random() * cards.length)];
        } else if (id) {
            selectedCard = cards.find(c => c.card_id === id);
        }

        if (!selectedCard) {
            return res.status(404).json({ error: "Card not found" });
        }

        // MAGIC TRICK: Route the image through YOUR Vercel Proxy instead of Shoob directly
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const proxyImageUrl = `${protocol}://${host}/api/image?id=${selectedCard.card_id}`;

        res.status(200).json({
            id: selectedCard.card_id,
            name: selectedCard.character || "Unknown",
            image: proxyImageUrl, // 👈 Your WhatsApp bot will hit this URL
            original_url: selectedCard.image_url
        });

    } catch (error) {
        console.error("DB Error:", error);
        res.status(500).json({ error: "Database error" });
    }
}
