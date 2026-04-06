const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 120 });

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 5, delayMs = 3000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6788.76 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.techpowerup.com/',
                'Connection': 'keep-alive'
            },
            maxRedirects: 5
        });

        const html = response.data;
        const $ = cheerio.load(html);
        const bodyText = $('body').text().toLowerCase();

        const looksLikeBotCheck =
            bodyText.includes('Automated bot check in progress') ||
            bodyText.includes('This should only take a few seconds.')

        if (!looksLikeBotCheck) {
            return response;
        }

        console.log(`[gpuSearch] Bot check detected on attempt ${attempt}/${retries}, waiting ${delayMs}ms...`);

        if (attempt < retries) {
            await sleep(delayMs);
        }
    }

    throw new Error('Bot check still active after retries');
}

async function scrapeGpuList(query) {
    const cacheKey = `gpu_list:${query}`;
    const cachedResults = cache.get(cacheKey);
    if (cachedResults) {
        console.log('Using cached GPU list for query:', query);
        return cachedResults;
    }

    const url = `https://www.techpowerup.com/gpu-specs/?q=${encodeURIComponent(query)}`;
    console.log('[gpuSearch] Fetching GPU list from:', url);

    let response;
    try {
        response = await fetchWithRetry(url, 5, 3000);
    } catch (error) {
        console.log('[gpuSearch] Failed to fetch GPU list:', error.message);
        return [];
    }

    const html = response.data;
    const $ = cheerio.load(html);

    const results = [];
    const seen = new Set();

    const addResult = (name, href) => {
        const cleanName = name?.replace(/\s+/g, ' ').trim();
        if (!cleanName || !href) return;

        const link = href.startsWith('http') ? href : `https://www.techpowerup.com${href}`;
        if (seen.has(link)) return;

        seen.add(link);
        results.push({ name: cleanName, link });
    };

    let rows = $('#list table.items-desktop-table tbody tr');

    if (rows.length === 0) {
        rows = $('table.items-desktop-table tbody tr');
    }

    rows.each((index, element) => {
        const nameElem = $(element).find('a[href*="/gpu-specs/"]').first();
        addResult(nameElem.text(), nameElem.attr('href'));
    });

    cache.set(cacheKey, results);
    return results;
}

async function scrapeGpuDetails(url) {
    const cacheKey = `gpu_detail:${url}`;
    const cachedDetails = cache.get(cacheKey);
    if (cachedDetails) {
        console.log('Using cached GPU details for URL:', url);
        return cachedDetails;
    }

    console.log('[gpuSearch] Fetching GPU details from:', url);

    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6788.76 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.techpowerup.com/',
            'Connection': 'keep-alive'
        },
        maxRedirects: 5
    });

    const html = response.data;
    const $ = cheerio.load(html);

    const specs = {};
    $('.sectioncontainer .details').each((index, section) => {
        let category = $(section).find('h2').text().trim();
        category = category.replace(/\s+/g, ' ');

        if (/^Retail boards\b/i.test(category)) {
            return;
        }

        specs[category] = {};
        $(section).find('dl').each((i, row) => {
            const key = $(row).find('dt').text().trim();
            const value = $(row).find('dd').text().trim();
            if (key && value) {
                specs[category][key] = value;
            }
        });
    });

    cache.set(cacheKey, specs);
    return specs;
}

module.exports = { scrapeGpuList, scrapeGpuDetails };
