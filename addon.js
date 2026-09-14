const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.scraper',
    version: '1.0.0',
    name: 'Top Cinema - أفلام ومسلسلات',
    description: 'يستخرج أحدث الأفلام والمسلسلات تلقائياً من موقع Top Cinema',
    resources: ['catalog', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'topcinema-movies',
            name: 'Top Cinema - أحدث الأفلام'
        }
    ]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        try {
            const url = 'https://topcinema.top/';
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            
            const $ = cheerio.load(data);
            const metas = [];

            $('.Small--Box').each((i, element) => {
                const title = $(element).find('.Title').text().trim();
                const poster = $(element).find('img').attr('data-src') || $(element).find('img').attr('src');
                const moviePageUrl = $(element).find('a').attr('href');

                if (title && moviePageUrl) {
                    metas.push({
                        id: 'topcin:' + Buffer.from(moviePageUrl).toString('base64'),
                        type: 'movie',
                        name: title,
                        poster: poster
                    });
                }
            });

            return { metas };
        } catch (error) {
            console.error('Error scraping website:', error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

module.exports = builder.getInterface();
