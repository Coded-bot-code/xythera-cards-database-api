const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
    console.log("🔥 [GITHUB ACTIONS] The Master Database Builder has awakened...");

    // Check if all_35k_ids.json exists
    if (!fs.existsSync('all_35k_ids.json')) {
        console.error("❌ all_35k_ids.json not found!");
        process.exit(1);
    }

    const allIds = JSON.parse(fs.readFileSync('all_35k_ids.json', 'utf8'));
    let database = [];
    let completedIds = new Set();

    if (fs.existsSync('master_database.json')) {
        try {
            database = JSON.parse(fs.readFileSync('master_database.json', 'utf8'));
            database.forEach(card => {
                if (card && card.id) completedIds.add(card.id);
            });
            console.log(`📦 Resuming! Already finished ${completedIds.size} cards.`);
        } catch(e) {
            console.log("⚠️ Error reading existing database, starting fresh...");
            database = [];
        }
    }

    const pendingIds = allIds.filter(id => !completedIds.has(id));
    console.log(`🚀 Remaining cards to scrape: ${pendingIds.length}`);

    if (pendingIds.length === 0) {
        console.log("🎉 DATABASE IS 100% COMPLETE!");
        process.exit(0);
    }

    // 🔥 BATCH LIMIT - Adjust based on your needs
    const BATCH_LIMIT = Math.min(pendingIds.length, 2000); // Reduced to 2000 for stability
    const targetIds = pendingIds.slice(0, BATCH_LIMIT);
    console.log(`📊 Processing ${targetIds.length} cards in this batch...`);

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080'
        ]
    });

    const CONCURRENCY = 10; // Reduced to 10 for stability (GitHub Actions)
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < targetIds.length; i += CONCURRENCY) {
        let promises = [];
        let batchData = [];

        console.log(`\n📦 Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(targetIds.length / CONCURRENCY)}...`);

        for (let j = 0; j < CONCURRENCY && (i + j) < targetIds.length; j++) {
            const id = targetIds[i + j];

            promises.push((async () => {
                const page = await browser.newPage();
                
                // Set user agent
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    // Only block images and media to speed up
                    if (['image', 'media', 'font', 'stylesheet'].includes(req.resourceType())) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });

                try {
                    const url = `https://shoob.gg/cards/info/${id}`;
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    
                    // Wait for content to load
                    await page.waitForFunction(() => {
                        return document.body && document.body.innerText.length > 100;
                    }, { timeout: 15000 }).catch(() => {});

                    const cardData = await page.evaluate((cardId, cardUrl) => {
                        let card = {
                            id: cardId,
                            name: "Unknown",
                            tier: "Unknown",
                            series: "Unknown",
                            maker: "Official",
                            image: `https://api.shoob.gg/site/api/cardr/${cardId}?size=original`,
                            url: cardUrl,
                            scrapedAt: new Date().toISOString()
                        };
                        
                        // Get all text content
                        let text = document.body.innerText;
                        let lines = text.split('\n').map(t => t.trim()).filter(t => t.length > 0);
                        
                        // Find Tier
                        let tierLineIdx = lines.findIndex(l => l.match(/^Tier\s+[1-6S]$/i));
                        if (tierLineIdx !== -1) {
                            card.tier = lines[tierLineIdx].toUpperCase();
                            
                            // Get series and name (usually next 2 non-empty lines)
                            let nextLines = [];
                            for (let k = tierLineIdx + 1; k < Math.min(tierLineIdx + 15, lines.length); k++) {
                                if (lines[k] && lines[k] !== '>' && !lines[k].match(/^Tier/i)) {
                                    nextLines.push(lines[k]);
                                    if (nextLines.length >= 2) break;
                                }
                            }
                            
                            if (nextLines.length >= 2) {
                                card.series = nextLines[0];
                                card.name = nextLines[1];
                            }
                        }
                        
                        // Alternative: Find name from header
                        if (card.name === "Unknown") {
                            let headerMatch = lines.find(l => l.match(/\s+-\s+T[1-6S]$/i));
                            if (headerMatch) {
                                card.name = headerMatch.split('-')[0].trim();
                            }
                        }
                        
                        // Alternative: Find name from title
                        if (card.name === "Unknown" && document.title) {
                            let titleMatch = document.title.match(/^(.*?)\s+-\s+T/);
                            if (titleMatch) {
                                card.name = titleMatch[1].trim();
                            }
                        }
                        
                        // Find Card Maker
                        let makerLine = lines.find(l => l.startsWith('Card Maker:'));
                        if (makerLine) {
                            card.maker = makerLine.replace('Card Maker:', '').replace('See the Maker', '').trim();
                        }
                        
                        // Check if card is animated (Tier S and 6 are often GIFs)
                        card.is_animated = card.tier === 'TIER S' || card.tier === 'TIER 6';
                        
                        return card;
                    }, id, url);

                    batchData.push(cardData);
                    successful++;
                    console.log(`✅ [${successful}] ${cardData.name} | ${cardData.tier} | ${cardData.series}`);
                    
                } catch(e) {
                    failed++;
                    console.log(`⚠️ Failed ID ${id}: ${e.message}`);
                } finally {
                    await page.close();
                }
            })());
        }

        await Promise.all(promises);
        
        // Add batch data to database
        batchData.forEach(card => {
            if (card && card.id) {
                // Check if card already exists (avoid duplicates)
                const existingIndex = database.findIndex(c => c.id === card.id);
                if (existingIndex !== -1) {
                    database[existingIndex] = card; // Update
                } else {
                    database.push(card);
                }
            }
        });
        
        // Save after each batch
        fs.writeFileSync('master_database.json', JSON.stringify(database, null, 2));
        console.log(`💾 Saved! Total: ${database.length} cards (Success: ${successful}, Failed: ${failed})`);
        
        // Add a small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n🏆 BATCH COMPLETE!`);
    console.log(`📊 Final Stats:`);
    console.log(`   • Total in database: ${database.length}`);
    console.log(`   • Successfully scraped: ${successful}`);
    console.log(`   • Failed: ${failed}`);
    
    await browser.close();
    
    // Create a backup
    const backupPath = `backup_${Date.now()}.json`;
    fs.writeFileSync(backupPath, JSON.stringify(database, null, 2));
    console.log(`💾 Backup saved to ${backupPath}`);
    
    process.exit(0);
})().catch(error => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
});