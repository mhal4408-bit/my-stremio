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

// 1. جلب قائمة الأفلام والبوسترات
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        try {
            const url = 'https://web5.topcinema.fan/movies/';
            
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

            $('.Small--Box, .movie-box, .BlockItem, article, .post-item').each((i, element) => {
                const linkNode = $(element).find('a').first();
                const moviePageUrl = linkNode.attr('href') || $(element).attr('href');
                
                const titleNode = $(element).find('.Title, .title, h3, h2, .name').first();
                const title = titleNode.text().trim() || linkNode.attr('title') || '';

                const imgNode = $(element).find('img').first();
                let poster = imgNode.attr('data-src') || imgNode.attr('data-lazy-src') || imgNode.attr('src') || '';

                if (title && moviePageUrl) {
                    if (poster && poster.startsWith('//')) {
                        poster = 'https:' + poster;
                    }

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
            console.error('Error scraping Top Cinema catalog:', error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. معالج روابط التشغيل والسيرفرات المحدث
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const moviePageUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': moviePageUrl
            };

            // 1. زيارة صفحة التفاصيل الأولى للفيلم
            const { data: mainData } = await axios.get(moviePageUrl, { headers, timeout: 10000 });
            const $main = cheerio.load(mainData);

            // البحث عن رابط زر "مشاهدة الان" بجميع الأشكال الممكنة
            let watchPageUrl = '';
            $main('a').each((i, el) => {
                const href = $main(el).attr('href') || '';
                const text = $main(el).text().trim();
                
                if (href.includes('/watch/') || text.includes('مشاهدة الان') || text.includes('مشاهدة الآن') || text.includes('مشاهدة')) {
                    watchPageUrl = href;
                }
            });

            if (!watchPageUrl) {
                watchPageUrl = moviePageUrl;
            } else if (!watchPageUrl.startsWith('http')) {
                watchPageUrl = 'https://web5.topcinema.fan' + watchPageUrl;
            }

            // 2. زيارة صفحة المشاهدة وسحب مشغلات السيرفرات
            const { data: watchData } = await axios.get(watchPageUrl, { headers, timeout: 10000 });
            const $watch = cheerio.load(watchData);
            const streams = [];

            $watch('iframe, [data-server], [data-url], [data-link], .server-item, ul.servers-list li').each((i, element) => {
                let streamUrl = $watch(element).attr('src') || $watch(element).attr('data-server') || $watch(element).attr('data-url') || $watch(element).attr('data-link');

                if (streamUrl) {
                    if (streamUrl.startsWith('//')) {
                        streamUrl = 'https:' + streamUrl;
                    }

                    let serverName = `سيرفر ${i + 1}`;
                    if (streamUrl.includes('dood')) serverName = 'DoodStream';
                    else if (streamUrl.includes('voe')) serverName = 'VOE';
                    else if (streamUrl.includes('streamtape')) serverName = 'Streamtape';
                    else if (streamUrl.includes('filelions')) serverName = 'FileLions';

                    streams.push({
                        title: `Top Cinema - ${serverName}`,
                        url: streamUrl
                    });
                }
            });

            return { streams };
        } catch (error) {
            console.error('Error fetching stream links:', error.message);
            return { streams: [] };
        }
    }
    return { streams: [] };
});

// 3. تشغيل السيرفر
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
