const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
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

// 1. جلب قائمة الأفلام والبوسترات من الموقع
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        try {
            // استخدام رابط قسم الأفلام المباشر أو الصفحة الرئيسية
            const url = 'https://topcinema.top/';
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
                },
                timeout: 10000
            });
            
            const $ = cheerio.load(data);
            const metas = [];

            // البحث عن كروت الأفلام باستخدام أكثر من Selector شائع في الموقع
            $('.Small--Box, .movie-box, .BlockItem, article').each((i, element) => {
                const title = $(element).find('.Title, .title, h3, h2').first().text().trim();
                
                // البحث عن صورة البوستر في كافّة الخصائص الممكنة (lazy loading)
                const imgNode = $(element).find('img').first();
                const poster = imgNode.attr('data-src') || imgNode.attr('data-lazy-src') || imgNode.attr('src');
                
                const moviePageUrl = $(element).find('a').first().attr('href');

                if (title && moviePageUrl) {
                    metas.push({
                        id: 'topcin:' + Buffer.from(moviePageUrl).toString('base64'),
                        type: 'movie',
                        name: title,
                        poster: poster && poster.startsWith('http') ? poster : (poster ? 'https:' + poster : '')
                    });
                }
            });

            console.log(`Scraped ${metas.length} items from Top Cinema.`);
            return { metas };
        } catch (error) {
            console.error('Error scraping Top Cinema:', error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. معالج روابط التشغيل
builder.defineStreamHandler(async (args) => {
    return { streams: [] };
});

// 3. تشغيل السيرفر
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
