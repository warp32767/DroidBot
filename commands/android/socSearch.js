const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

// Create an Axios instance with headers and a timeout
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6788.76 Safari/537.36'
    },
    timeout: 10000 // set an optional timeout
});

// Create caches (TTL in seconds, here 86400 seconds equals 24 hours)
const searchCache = new NodeCache({ stdTTL: 86400 });
const detailsCache = new NodeCache({ stdTTL: 86400 });
const imageCache = new NodeCache({ stdTTL: 86400 });

async function scrapeSocList(query) {
    const cached = searchCache.get(query);
    if (cached) return cached;

    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
    const url = "http://phonedb.net/index.php?m=processor&s=list";
    const bodyFormData = new URLSearchParams();
    bodyFormData.append('search_exp', query);
    bodyFormData.append('search_header', '');

    const response = await axiosInstance({
        method: "post",
        url,
        params: bodyFormData,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];

    $('.content_block_title a').each((index, element) => {
        const title = $(element).attr('title');
        const name = title.replace('  ', ' ');
        const href = $(element).attr('href');
        const link = "http://phonedb.net/" + href;
        results.push({ name, link });
    });

    searchCache.set(query, results);
    return results;
}

async function scrapeSoCDetails(url) {
    const cached = detailsCache.get(url);
    if (cached) return cached;

    const response = await axiosInstance.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const specs = [];

    $('table tbody tr').each((index, row) => {
        const label = $(row).find('td:first-child strong').text().trim();
        const value = $(row).find('td:last-child').text().trim();
        if (label && value) {
            specs.push({ label, value });
        }
    });

    detailsCache.set(url, specs);
    return specs;
}

async function getSocImage(url) {
    const cached = imageCache.get(url);
    if (cached) return cached;

    const response = await axiosInstance.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const imgElement = $('div.sidebar img');
    let imgUrl = null;
    if (imgElement.length > 0) {
        const src = imgElement.attr('src');
        imgUrl = `https://phonedb.net/${src}`;
    }

    imageCache.set(url, imgUrl);
    return imgUrl;
}

module.exports = {
    scrapeSocList,
    scrapeSoCDetails,
    getSocImage,
    axiosInstance
};