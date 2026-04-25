import fs from 'fs';
import path from 'path';

// Tiers that are stored as MP4 on shoob and should be served as playable WebP
const ANIMATED_TIERS = new Set(['TIER S', 'TIER 6']);

export default function handler(req, res) {
    const { key, random, id } = req.query;

    if (key !== 'XYTHERA_API') {
        return res.status(401).json({ error: 'Unauthorized API Key' });
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
            return res.status(404).json({ error: 'Card not found' });
        }

        const realId = selectedCard.id || selectedCard.card_id;
        const tier = selectedCard.tier || 'Unknown';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;

        // Tier S and Tier 6 cards are MP4 on shoob — image.js will convert them to high-quality WebP
        const isPlayableWebp = ANIMATED_TIERS.has(tier);

        // Pass playable_webp=true so image.js knows to serve as WebP
        const proxyImageUrl = `${protocol}://${host}/api/image?id=${realId}&playable_webp=${isPlayableWebp}`;

        return res.status(200).json({
            id: realId,
            name: selectedCard.name || selectedCard.character || 'Unknown',
            tier,
            series: selectedCard.series || 'Unknown',
            maker: selectedCard.maker || 'Official',
            image: proxyImageUrl,
            original_url: selectedCard.image || selectedCard.image_url,
            is_playable_webp: isPlayableWebp   // true = Tier S / Tier 6 — will be served as playable WebP
        });

    } catch (error) {
        console.error('DB Error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
}