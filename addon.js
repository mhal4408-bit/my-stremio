const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.scraper',
    version: '1.0.3', // رفع رقم الإصدار لتفريغ الـ Cache في Stremio
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

// 1. جلب الكتالوج
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        try {
            const url = 'https://web5.topcinema.fan/movies/';
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            
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
            console.error('Error scraping catalog:', error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. معالج السيرفرات المحدث لفك تشفير embedScreen
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const moviePageUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': moviePageUrl
            };

            // 1. طلب الصفحة الأولى
            const { data: mainData } = await axios.get(moviePageUrl, { headers, timeout: 10000 });
            const $main = cheerio.load(mainData);

            let watchPageUrl = '';
            $main('a').each((i, el) => {
                const href = $main(el).attr('href') || '';
                if (href.includes('/watch/')) watchPageUrl = href;
            });

            if (!watchPageUrl) watchPageUrl = moviePageUrl;
            if (!watchPageUrl.startsWith('http')) watchPageUrl = 'https://web5.topcinema.fan' + watchPageUrl;

            // 2. طلب صفحة المشاهدة
            const { data: watchData } = await axios.get(watchPageUrl, { headers, timeout: 10000 });
            const $watch = cheerio.load(watchData);
            const streams = [];

            // استخراج رابط embedScreen المباشر
            const embedUrl = $watch('meta[property="og:video:url"]').attr('content') || $watch('meta[property="og:video:secure_url"]').attr('content');

            if (embedUrl) {
                try {
                    // زيارة صفحة الـ Embed لاستخراج الـ iframe الحقيقي من داخلها
                    const { data: embedData } = await axios.get(embedUrl, { headers, timeout: 8000 });
                    const $embed = cheerio.load(embedData);

                    $embed('iframe').each((i, el) => {
                        let src = $embed(el).attr('src') || $embed(el).attr('data-src');
                        if (src) {
                            if (src.startsWith('//')) src = 'https:' + src;
                            streams.push({
                                title: 'Top Cinema - Main Server ⚡',
                                url: src
                            });
                        }
                    });
                } catch (e) {
                    // في حال تعذر فتح صفحة الـ embed نضع الرابط المباشر
                    streams.push({
                        title: 'Top Cinema - Server Player',
                        url: embedUrl
                    });
                }
            }

            // فحص إضافي لأي iframe بصفحة المشاهدة
            $watch('iframe').each((i, element) => {
                let src = $watch(element).attr('src') || $watch(element).attr('data-src');
                if (src && !src.includes('facebook') && !src.includes('google')) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    streams.push({
                        title: `Top Cinema - Server ${i + 1}`,
                        url: src
                    });
                }
            });

            const uniqueStreams = Array.from(new Map(streams.map(item => [item.url, item])).values());
            return { streams: uniqueStreams };
        } catch (error) {
            console.error('Error fetching streams:', error.message);
            return { streams: [] };
        }
    }
    return { streams: [] };
});

// 3. تشغيل السيرفر
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
