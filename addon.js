const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.fast.v1',
    version: '1.0.0',
    name: 'Top Cinema - أفلام ومسلسلات',
    description: 'إضافة سريعة وخفيفة لموقع Top Cinema',
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

// إعدادات الطلبات لتجاوز الحظر ومنع الـ Crash
const httpConfig = {
    timeout: 8000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        'Cache-Control': 'no-cache'
    }
};

// 1. الكتالوج - جلب الأفلام والبوسترات بثبات
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        try {
            const { data } = await axios.get('https://web5.topcinema.fan/movies/', httpConfig);
            const $ = cheerio.load(data);
            const metas = [];

            $('.Small--Box, .movie-box, .BlockItem, article, .post-item').each((i, element) => {
                const linkNode = $(element).find('a').first();
                const moviePageUrl = linkNode.attr('href') || $(element).attr('href');
                const titleNode = $(element).find('.Title, .title, h3, h2, .name').first();
                const title = titleNode.text().trim() || linkNode.attr('title') || '';
                const imgNode = $(element).find('img').first();
                let poster = imgNode.attr('data-src') || imgNode.attr('data-lazy-src') || imgNode.attr('src') || '';

                if (title && moviePageUrl) {
                    if (poster && poster.startsWith('//')) poster = 'https:' + poster;
                    metas.push({
                        id: 'topcin:' + Buffer.from(moviePageUrl).toString('base64'),
                        type: 'movie',
                        name: title,
                        poster: poster
                    });
                }
            });

            const uniqueMetas = Array.from(new Map(metas.map(item => [item.id, item])).values());
            return { metas: uniqueMetas };
        } catch (error) {
            console.error('Catalog Error:', error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. معالج السيرفرات المباشر السريع
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const movieMainUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
            
            // تحويل رابط الفيلم المباشر إلى رابط صفحة المشاهدة
            let watchPageUrl = movieMainUrl.replace(/\/$/, '') + '/watch/';

            const { data } = await axios.get(watchPageUrl, {
                ...httpConfig,
                headers: { ...httpConfig.headers, 'Referer': movieMainUrl }
            });

            const $ = cheerio.load(data);
            const streams = [];

            // أ) جلب السيرفرات المباشرة المتاحة في الصفحة
            $('iframe').each((i, el) => {
                let src = $(el).attr('src') || $(el).attr('data-src');
                if (src && !src.includes('facebook') && !src.includes('google')) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    streams.push({
                        title: `Top Cinema - Server ${i + 1}`,
                        url: src
                    });
                }
            });

            // ب) جلب المشغل المضمن
            const embedUrl = $('meta[property="og:video:url"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
            if (embedUrl) {
                streams.push({
                    title: 'Top Cinema - Fast Server ⚡',
                    url: embedUrl
                });
            }

            const uniqueStreams = Array.from(new Map(streams.map(item => [item.url, item])).values());
            return { streams: uniqueStreams };
        } catch (error) {
            console.error('Stream Error:', error.message);
            return { streams: [] };
        }
    }
    return { streams: [] };
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
