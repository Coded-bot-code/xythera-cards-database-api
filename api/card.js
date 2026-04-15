import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
    const { key, random, id } = req.query;

    if (key !== 'XYTHERA_API') {
        return res.status(401).json({ error: "Unauthorized API Key" });
    }

    try {
        const dbPath = path.join(process.cwd(), 'master_database.json');
        const rawData = fs.readFileSync(dbPath, 'utf8');
        const cards = JSON.parse(rawData);

        let selectedCard = null;

        if (random === 'true') {
            selectedCard = cards[Math.floor(Math.random() * cards.length)];
        } else if (id) {
            selectedCard = cards.find(c => c.id === id || c.card_id === id);
        }

        if (!selectedCard) {
            return res.status(404).json({ error: "Card not found" });
        }

        const realId = selectedCard.id || selectedCard.card_id;
        const tier = selectedCard.tier || "Unknown";
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        
        // Add GIF detection based on tier
        const isAnimated = tier === 'TIER S' || tier === 'TIER 6';
        
        // Pass isAnimated as query param to image handler
        const proxyImageUrl = `${protocol}://${host}/api/image?id=${realId}&animated=${isAnimated}`;

        res.status(200).json({
            id: realId,
            name: selectedCard.name || selectedCard.character || "Unknown",
            tier: tier,
            series: selectedCard.series || "Unknown",
            maker: selectedCard.maker || "Official",
            image: proxyImageUrl,
            original_url: selectedCard.image || selectedCard.image_url,
            is_animated: isAnimated  // Add this flag for frontend
        });

    } catch (error) {
        console.error("DB Error:", error);
        res.status(500).json({ error: "Database error" });
    }
}