const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.puppeteer.v1',
    version: '1.0.0',
    name: 'Top Cinema - أفلام ومسلسلات',
    description: 'يستخرج أحدث الأفلام والمسلسلات عبر متصفح تلقائي',
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

// 1. الكتالوج
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            await page.goto('https://web5.topcinema.fan/movies/', { waitUntil: 'domcontentloaded', timeout: 20000 });
            const content = await page.content();
            const $ = cheerio.load(content);
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

            await browser.close();
            const uniqueMetas = Array.from(new Map(metas.map(item => [item.id, item])).values());
            return { metas: uniqueMetas };
        } catch (error) {
            if (browser) await browser.close();
            console.error('Catalog Puppeteer Error:', error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. معالج السيرفرات عبر فتح الصفحة بالمتصفح الوهمي وتخطى الحماية
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        let browser;
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const movieMainUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
            const watchPageUrl = movieMainUrl.replace(/\/$/, '') + '/watch/';

            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            // فتح صفحة المشاهدة مباشرة والانتظار لتفادي التوجيهات
            await page.goto(watchPageUrl, { waitUntil: 'networkidle2', timeout: 25000 });

            // استخراج محتوى الصفحة بعد تحميل جميع النصوص البرمجية
            const content = await page.content();
            const $ = cheerio.load(content);
            const streams = [];

            // أ) جلب الـ Iframes المتاحة
            $('iframe').each((i, el) => {
                let src = $(el).attr('src') || $(el).attr('data-src');
                if (src && !src.includes('facebook') && !src.includes('google')) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    streams.push({
                        title: `Top Cinema - Server Main ${i + 1}`,
                        url: src
                    });
                }
            });

            // ب) جلب المشغل المباشر المضمن
            const embedUrl = $('meta[property="og:video:url"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
            if (embedUrl) {
                streams.push({
                    title: 'Top Cinema - Direct Stream ⚡',
                    url: embedUrl
                });
            }

            await browser.close();
            const uniqueStreams = Array.from(new Map(streams.map(item => [item.url, item])).values());
            return { streams: uniqueStreams };
        } catch (error) {
            if (browser) await browser.close();
            console.error('Stream Puppeteer Error:', error.message);
            return { streams: [] };
        }
    }
    return { streams: [] };
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
