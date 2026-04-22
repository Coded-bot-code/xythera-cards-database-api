// pages/api/search.js
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
    const { key, q, page = 1, limit = 20 } = req.query;
    
    if (key !== 'XYTHERA_API') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const dbPath = path.join(process.cwd(), 'master_database.json');
        const allCards = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        
        const searchLower = q?.toLowerCase() || '';
        const results = allCards.filter(card => 
            card.name?.toLowerCase().includes(searchLower) ||
            card.character?.toLowerCase().includes(searchLower) ||
            card.series?.toLowerCase().includes(searchLower) ||
            card.tier?.toLowerCase().includes(searchLower)
        );
        
        const start = (page - 1) * limit;
        const paginated = results.slice(start, start + limit);
        
        res.status(200).json({
            success: true,
            total: results.length,
            page: parseInt(page),
            limit: parseInt(limit),
            results: paginated
        });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
}