const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const builder = new addonBuilder({
    id: 'org.sexmasry.addon',
    version: '1.0.0',
    name: 'Sex Masry Addon',
    description: 'Stremio Addon for Sex Masry directly',
    types: ['movie'],
    catalogs: [
        {
            type: 'movie',
            id: 'sexmasry_catalog',
            name: 'Sex Masry Movies'
        }
    ],
    resources: ['catalog', 'stream']
});

builder.defineCatalogHandler(async function(args) {
    try {
        const response = await axios.get('https://sex-masry.site/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const metas = [];

        $('article, .movie-box, .Small--Box, .post-item').each((index, element) => {
            const el = $(element);
            const linkObj = el.find('a');
            const href = linkObj.attr('href');
            const title = el.find('.Title, .title, h3, h2').text().trim() || `Movie ${index + 1}`;
            const img = el.find('img').attr('src') || el.find('img').attr('data-src') || '';

            if (href) {
                const id = 'sexmasry:' + Buffer.from(href).toString('base64');
                metas.push({
                    id: id,
                    type: 'movie',
                    name: title,
                    poster: img.startsWith('//') ? 'https:' + img : img
                });
            }
        });

        return { metas: metas };
    } catch (e) {
        console.error("Error fetching catalog:", e);
        return { metas: [] };
    }
});

builder.defineStreamHandler(async function(args) {
    try {
        const encodedUrl = args.id.replace('sexmasry:', '');
        const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf8');

        return {
            streams: [
                {
                    title: 'Direct Stream ⚡',
                    url: targetUrl
                }
            ]
        };
    } catch (e) {
        console.error("Error fetching stream:", e);
        return { streams: [] };
    }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
