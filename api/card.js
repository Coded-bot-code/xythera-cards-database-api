const database = require('../master_database.json');

const dbMap = {};
database.forEach(card => {
    dbMap[card.id] = card;
});

// 🛑 SILENT TECH SECRET API KEY 🛑
const SECRET_KEY = "SILENT_TECH_2026"; 

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { id, key, random } = req.query;

    if (key !== SECRET_KEY) {
        return res.status(401).json({ error: "❌ Access Denied: Invalid Silent Tech API Key" });
    }

    // 🎲 NEW: PULL A RANDOM CARD!
    if (random === 'true') {
        const randomIndex = Math.floor(Math.random() * database.length);
        return res.status(200).json(database[randomIndex]);
    }

    if (!id) {
        return res.status(400).json({ error: "❌ Error: Please provide a Card ID or set random=true" });
    }

    const card = dbMap[id];
    if (card) {
        res.status(200).json(card);
    } else {
        res.status(404).json({ error: "Card not found in Silent Tech Database" });
    }
}
