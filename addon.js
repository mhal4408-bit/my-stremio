const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio =ريخ = require('cheerio'); // تصحيح الاستيراد

const builder = new addonBuilder({
    id: 'org.sexmasry.addon',
    version: '1.0.6',
    name: 'Sex Masry Addon',
    description: 'Stremio Addon for Sex Masry Direct',
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
        let metas = [];
        let seenLinks = new Set();

        // جلب الصفحة الرئيسية للموقع
        const response = await axios.get('https://sex-masry.site/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://sex-masry.site/'
            },
            timeout: 8000
        });

        const $ = cheerio.load(response.data);

        // بحث شامل عن كل الروابط التي تحتوي على صور أو بوسترات في الصفحة
        $('a').each((index, element) => {
            const el = $(element);
            const href = el.attr('href');
            const img = el.find('img').attr('src') || el.find('img').attr('data-src');
            
            if (href && img) {
                // التأكد من أن الرابط يتبع للموقع وليس روابط خارجية أو أقسام عامة
                if (href.includes('sex-masry.site') || href.startsWith('/')) {
                    let fullUrl = href.startsWith('/') ? 'https://sex-masry.site' + href : href;
                    
                    if (!seenLinks.has(fullUrl)) {
                        seenLinks.add(fullUrl);

                        let title = el.attr('title') || el.find('img').attr('alt') || el.text().trim() || 'Video ' + (metas.length + 1);
                        let posterUrl = img.startsWith('//') ? 'https:' + img : img;
                        if (!posterUrl.startsWith('http')) {
                            posterUrl = 'https://sex-masry.site' + posterUrl;
                        }

                        const id = 'sexmasry:' + Buffer.from(fullUrl).toString('base64');
                        
                        metas.push({
                            id: id,
                            type: 'movie',
                            name: title.substring(0, 50),
                            poster: posterUrl
                        });
                    }
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

        // توجيه المستخدم مباشرة لرابط صفحة الفيلم لتعمل بشكل مضمون 100% بدون أخطاء تشغيل
        return {
            streams: [
                {
                    title: '▶ Watch on Site / Player',
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
