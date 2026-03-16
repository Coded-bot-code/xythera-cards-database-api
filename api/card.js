// This loads your massive file instantly
const database = require('../master_database.json');

// Optimize for 0.0001ms lookups
const dbMap = {};
database.forEach(card => {
    dbMap[card.id] = card;
});

// 🛑 SILENT TECH SECRET API KEY 🛑
const SECRET_KEY = "SILENT_TECH_2026"; 

export default function handler(req, res) {
    // Enable CORS just in case your bot needs it
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { id, key } = req.query;

    // Security Check
    if (key !== SECRET_KEY) {
        return res.status(401).json({ error: "❌ Access Denied: Invalid Silent Tech API Key" });
    }

    if (!id) {
        return res.status(400).json({ error: "❌ Error: Please provide a Card ID" });
    }

    // Find the card!
    const card = dbMap[id];

    if (card) {
        res.status(200).json(card);
    } else {
        res.status(404).json({ error: "Card not found in Silent Tech Database" });
    }
}
