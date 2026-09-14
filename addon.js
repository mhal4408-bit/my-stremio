const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'org.topcinema.fast.v2',
    version: '2.0.0', // رفع الاصدار لضمان مسح الـ Cache في Stremio
    name: 'Top Cinema - أفلام ومسلسلات',
    description: 'إضافة سريعة لموقع Top Cinema',
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

const httpConfig = {
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
    }
};

// 1. الكتالوج - جلب قائمة الأفلام
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

// 2. معالج السيرفرات - استخراج الـ Nonce المخبأ وتنفيذ طلب الـ AJAX
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id.startsWith('topcin:')) {
        try {
            const encodedUrl = args.id.replace('topcin:', '');
            const movieMainUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
            let watchPageUrl = movieMainUrl.replace(/\/$/, '') + '/watch/';

            const { data: watchHtml } = await axios.get(watchPageUrl, {
                ...httpConfig,
                headers: { ...httpConfig.headers, 'Referer': movieMainUrl }
            });

            const $ = cheerio.load(watchHtml);
            const streams = [];

            // أ) استخراج الـ Nonce المخبأ داخل نصوص الجافاسكريبت بالصفحة
            let nonce = $('body').attr('data-nonce') || $('[data-nonce]').attr('data-nonce') || '';
            if (!nonce) {
                const nonceMatch = watchHtml.match(/nonce["']\s*:\s*["']([^"']+)["']/);
                if (nonceMatch) nonce = nonceMatch[1];
            }

            // ب) استخراج أزرار السيرفرات وتنفيذ طلبات الـ AJAX
            const ajaxPromises = [];
            $('li.server--item, .watch--servers-list li').each((i, el) => {
                const postId = $(el).attr('data-id');
                const serverNum = $(element = el).attr('data-server');
                const serverName = $(el).text().trim() || `Server ${i + 1}`;

                if (postId && serverNum !== undefined) {
                    const req = axios.post('https://web5.topcinema.fan/wp-admin/admin-ajax.php', 
                        new URLSearchParams({
                            action: 'get_player_server',
                            i: serverNum,
                            id: postId,
                            nonce: nonce
                        }).toString(), 
                        {
                            headers: {
                                ...httpConfig.headers,
                                'Referer': watchPageUrl,
                                'X-Requested-With': 'XMLHttpRequest',
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                            },
                            timeout: 5000
                        }
                    ).then(res => {
                        const responseHtml = typeof res.data === 'string' ? res.data : (res.data.embed || res.data.html || JSON.stringify(res.data));
                        const $embed = cheerio.load(responseHtml);
                        let iframeSrc = $embed('iframe').attr('src') || $embed('iframe').attr('data-src');

                        if (iframeSrc) {
                            if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                            return { title: `Top Cinema - ${serverName}`, url: iframeSrc };
                        }
                        return null;
                    }).catch(() => null);

                    ajaxPromises.push(req);
                }
            });

            const results = await Promise.all(ajaxPromises);
            results.forEach(res => { if (res) streams.push(res); });

            // ج) خيار احتياطي لتضمين رابط og:video
            const embedUrl = $('meta[property="og:video:url"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
            if (embedUrl && streams.length === 0) {
                streams.push({ title: 'Top Cinema - Player Direct ⚡', url: embedUrl });
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
