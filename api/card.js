import fs from 'fs';
import path from 'path';

// Tier S and Tier 6 cards are served by shoob as animated WebP.
// image.js converts them to GIF when animated=true is in the query.
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

        let card = null;

        if (random === 'true') {
            card = cards[Math.floor(Math.random() * cards.length)];
        } else if (id) {
            card = cards.find(c => c.id === id || c.card_id === id);
        }

        if (!card) {
            return res.status(404).json({ error: 'Card not found' });
        }

        const cardId    = card.id || card.card_id;
        const tier      = card.tier || 'Unknown';
        const isAnimated = ANIMATED_TIERS.has(tier);

        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host  = req.headers.host;

        // /api/image proxies shoob's CDN (follows redirect server-side).
        // animated=true tells image.js to convert the animated WebP to a GIF.
        const imageUrl = `${proto}://${host}/api/image?id=${cardId}&animated=${isAnimated}`;

        return res.status(200).json({
            id:          cardId,
            name:        card.name || card.character || 'Unknown',
            tier,
            series:      card.series  || 'Unknown',
            maker:       card.maker   || 'Official',
            image:       imageUrl,
            is_animated: isAnimated,
            // Expose the raw shoob URL so clients can see the original source
            source_url:  card.image   || `https://api.shoob.gg/site/api/cardr/${cardId}?size=original`
        });

    } catch (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
    }
}
