const { getHtml } = require('../../handler/gsmClient');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 120 });

async function searchGSMArena(query) {
    const cachedResults = cache.get(query);
    if (cachedResults) {
        console.log('Using cached results');
        return cachedResults
    }
    
    try {
        const url = `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(query)}`;
        const data = await getHtml(url);

        const $ = cheerio.load(data);
        const results = $('#review-body .makers ul li').map((i, element) => {
            const rawName = $(element).find('strong').html();
            const name = rawName 
                ? rawName.replace(/<br\s*\/?>/gi, ' ')
                         .replace(/<[^>]+>/g, '')
                         .replace(/\s+/g, ' ')
                         .trim() 
                : null;
            const link = $(element).find('a').attr('href');
            const imageUrl = $(element).find('img').attr('src');
            return name && link 
                ? { 
                    name, 
                    link: `https://www.gsmarena.com/${link}`, 
                    imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : `https://www.gsmarena.com/${imageUrl}` 
                  }
                : null;
        }).get();

        cache.set(query, results);
        return results;
    } catch (error) {
        console.error("GSMArena search failed:", error.message);
        throw error;
    }
}

async function parseResults(query) {
    return await searchGSMArena(query);
}

module.exports = {
    parseResults,
};
