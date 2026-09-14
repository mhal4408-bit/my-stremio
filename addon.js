const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.scraper.v5',
    version: '5.0.0', // رفع رقم الإصدار لإلغاء الـ Cache القديم في Stremio
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

// 1. معالج الكتالوج - جلب قائمة الأفلام
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'movie' && args.id === 'topcinema-movies') {
        try {
            const url = 'https://web5.topcinema.fan/movies/';
            const { data } = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
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

// 2. معالج السيرفرات المتطور - التغلب على إعادة التوجيه والإعلانات
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const movieMainUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

            // إنشاء جلسة مع حفظ الـ Cookies وتتبع الروابط (Max Redirects)
            const client = axios.create({
                timeout: 12000,
                maxRedirects: 10,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
                }
            });

            // الخطوة 1: طلب صفحة الفيلم الرئيسية
            const mainRes = await client.get(movieMainUrl);
            const $main = cheerio.load(mainRes.data);

            let watchPageUrl = '';
            $main('a').each((i, el) => {
                const href = $main(el).attr('href') || '';
                if (href.includes('/watch/')) {
                    watchPageUrl = href;
                }
            });

            if (!watchPageUrl) {
                watchPageUrl = movieMainUrl.replace(/\/$/, '') + '/watch/';
            } else if (!watchPageUrl.startsWith('http')) {
                watchPageUrl = 'https://web5.topcinema.fan' + watchPageUrl;
            }

            // الخطوة 2: طلب صفحة المشاهدة مع إرسال Referer حقيقي
            const watchRes = await client.get(watchPageUrl, {
                headers: { 'Referer': movieMainUrl }
            });
            const $watch = cheerio.load(watchRes.data);
            const streams = [];

            // أ) البحث عن روابط iframe المباشرة داخل الصفحة (تتجاهل إعلانات Pop-ups)
            $watch('iframe').each((i, el) => {
                let src = $watch(el).attr('src') || $watch(el).attr('data-src');
                if (src && !src.includes('facebook') && !src.includes('google') && !src.includes('doubleclick')) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    streams.push({
                        title: `Top Cinema - مشغّل رئيسي ${i + 1}`,
                        url: src
                    });
                }
            });

            // ب) البحث المباشر عن سيرفرات الاستضافة المخبأة داخل الكود (Dood, Streamtape, Uqload...)
            const htmlText = watchRes.data;
            const embedRegex = /https?:\/\/[^\s"'<>]+\/(?:e|embed|v|watch)\/[^\s"'<>]+/g;
            const foundUrls = htmlText.match(embedRegex) || [];

            foundUrls.forEach((embedUrl, idx) => {
                if (!embedUrl.includes('topcinema') && !embedUrl.includes('facebook') && !embedUrl.includes('google')) {
                    streams.push({
                        title: `Top Cinema - سيرفر خارجي مباشر ${idx + 1}`,
                        url: embedUrl
                    });
                }
            });

            // ج) تنفيذ طلبات AJAX لأزرار السيرفرات في حال توفرها
            const ajaxEndpoint = 'https://web5.topcinema.fan/wp-admin/admin-ajax.php';
            const serverPromises = [];

            $watch('li.server--item, .watch--servers-list li').each((i, element) => {
                const postId = $watch(element).attr('data-id');
                const serverNum = $watch(element).attr('data-server');
                const serverName = $watch(element).find('span').text().trim() || $watch(element).text().trim() || `سيرفر ${i + 1}`;

                if (postId && serverNum !== undefined) {
                    const fetchServer = async () => {
                        try {
                            const payload = new URLSearchParams({
                                action: 'get_player_server',
                                i: serverNum,
                                id: postId
                            });

                            const res = await client.post(ajaxEndpoint, payload.toString(), {
                                headers: {
                                    'Referer': watchPageUrl,
                                    'X-Requested-With': 'XMLHttpRequest',
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                                }
                            });

                            if (res.data) {
                                const htmlContent = typeof res.data === 'string' ? res.data : (res.data.embed || res.data.html || JSON.stringify(res.data));
                                const $embed = cheerio.load(htmlContent);
                                let iframeSrc = $embed('iframe').attr('src') || $embed('iframe').attr('data-src');

                                if (iframeSrc) {
                                    if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                                    return {
                                        title: `Top Cinema - ${serverName}`,
                                        url: iframeSrc
                                    };
                                }
                            }
                        } catch (e) {
                            // التجاوز عند خطأ أحد السيرفرات
                        }
                        return null;
                    };

                    serverPromises.push(fetchServer());
                }
            });

            const resolvedResults = await Promise.all(serverPromises);
            resolvedResults.forEach(item => {
                if (item) streams.push(item);
            });

            const uniqueStreams = Array.from(new Map(streams.map(item => [item.url, item])).values());
            return { streams: uniqueStreams };
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
