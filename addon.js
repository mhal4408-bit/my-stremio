const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.scraper',
    version: '1.0.6', // رفع رقم الإصدار لإنعاش الـ Cache داخل Stremio
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

// 2. معالج السيرفرات المحدث بشكل دقيق
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const moviePageUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

            // تحويل رابط الفيلم تلقائياً إلى رابط المشاهدة
            let watchPageUrl = moviePageUrl;
            if (!watchPageUrl.endsWith('/watch/') && !watchPageUrl.endsWith('/watch')) {
                watchPageUrl = watchPageUrl.replace(/\/$/, '') + '/watch/';
            }

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': watchPageUrl,
                'Origin': 'https://web5.topcinema.fan'
            };

            // جلب محتوى صفحة المشاهدة
            let watchData = '';
            try {
                const res = await axios.get(watchPageUrl, { headers, timeout: 10000 });
                watchData = res.data;
            } catch (err) {
                const res = await axios.get(moviePageUrl, { headers, timeout: 10000 });
                watchData = res.data;
            }

            const $watch = cheerio.load(watchData);
            const streams = [];
            const ajaxEndpoint = 'https://web5.topcinema.fan/wp-admin/admin-ajax.php';
            const serverPromises = [];

            // البحث المباشر في عناصر li.server--item
            $watch('li.server--item, .watch--servers-list li').each((i, element) => {
                const postId = $watch(element).attr('data-id');
                const serverNum = $watch(element).attr('data-server');
                const serverName = $watch(element).find('span').text().trim() || $watch(element).text().trim() || `سيرفر ${i + 1}`;

                if (postId && serverNum !== undefined) {
                    const fetchServer = async () => {
                        const payload = new URLSearchParams();
                        payload.append('action', 'get_player_server');
                        payload.append('i', serverNum);
                        payload.append('id', postId);

                        try {
                            const res = await axios.post(ajaxEndpoint, payload.toString(), {
                                headers: {
                                    ...headers,
                                    'X-Requested-With': 'XMLHttpRequest',
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                                },
                                timeout: 5000
                            });

                            if (res.data) {
                                const responseHtml = typeof res.data === 'string' ? res.data : (res.data.embed || res.data.html || JSON.stringify(res.data));
                                const $embed = cheerio.load(responseHtml);
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

            const results = await Promise.all(serverPromises);
            results.forEach(item => {
                if (item) streams.push(item);
            });

            // خيار احتياطي لتضمين مشغل og:video في حال فشل طلبات AJAX
            if (streams.length === 0) {
                const embedUrl = $watch('meta[property="og:video:url"]').attr('content') || $watch('meta[property="og:video:secure_url"]').attr('content');
                if (embedUrl) {
                    streams.push({
                        title: 'Top Cinema - سيرفر أصلي مباشر ⚡',
                        url: embedUrl
                    });
                }
            }

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
