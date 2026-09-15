const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const builder = new addonBuilder({
    id: 'org.sexmasry.addon',
    version: '1.0.7',
    name: 'Sex Masry Direct',
    description: 'Stremio Addon for Sex Masry Catalog',
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://sex-masry.site/'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const metas = [];
        const seenLinks = new Set();

        // استخراج جميع الروابط والصور المتاحة في الصفحة الرئيسية بدقة
        $('a').each((index, element) => {
            const el = $(element);
            const href = el.attr('href');
            const imgEl = el.find('img').length ? el.find('img') : el.closest('article, div').find('img');
            const img = imgEl.attr('src') || imgEl.attr('data-src');

            if (href && img) {
                let fullUrl = href.startsWith('/') ? 'https://sex-masry.site' + href : href;
                
                if (fullUrl.includes('sex-masry.site') && !seenLinks.has(fullUrl)) {
                    seenLinks.add(fullUrl);

                    let title = el.attr('title') || imgEl.attr('alt') || el.text().trim() || 'Movie ' + (metas.length + 1);
                    // تصفية العناوين الفارغة أو الطويلة جداً
                    if (title.length < 2 || title.length > 80) title = 'Exclusive Video';

                    let posterUrl = img.startsWith('//') ? 'https:' + img : img;
                    if (!posterUrl.startsWith('http')) {
                        posterUrl = 'https://sex-masry.site' + posterUrl;
                    }

                    const id = 'sexmasry:' + Buffer.from(fullUrl).toString('base64');

                    metas.push({
                        id: id,
                        type: 'movie',
                        name: title,
                        poster: posterUrl
                    });
                }
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

        // توفير رابط التشغيل أو التصفح المباشر
        return {
            streams: [
                {
                    title: '▶ Play / Open Link 🌐',
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
