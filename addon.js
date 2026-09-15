const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const builder = new addonBuilder({
    id: 'org.sexmasry.addon',
    version: '1.0.1',
    name: 'Sex Masry Addon',
    description: 'Stremio Addon for Sex Masry',
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
            }
        });
        
        const $ = cheerio.load(response.data);
        const metas = [];
        const seenLinks = new Set();

        // البحث الشامل عن أي رابط داخلي يحيط به صورة أو عنوان
        $('a').each((index, element) => {
            const el = $(element);
            const href = el.attr('href');
            
            // تصفية الروابط لتكون خاصة بالصفحات الداخلية للأفلام وليست الروابط العامة
            if (href && (href.includes('/movie/') || href.includes('/post/') || el.find('img').length > 0)) {
                if (!seenLinks.has(href)) {
                    seenLinks.add(href);

                    // محاولة استخراج العنوان والبوستر بأكثر من طريقة لضمان إيجادها
                    const title = el.attr('title') || el.find('img').attr('alt') || el.text().trim() || `Item ${metas.length + 1}`;
                    let img = el.find('img').attr('data-src') || el.find('img').attr('src') || '';

                    if (img.startsWith('//')) {
                        img = 'https:' + img;
                    } else if (img && !img.startsWith('http')) {
                        img = 'https://sex-masry.site' + img;
                    }

                    // ضبط رابط الـ URL الكامل إذا كان نسبياً
                    let fullUrl = href;
                    if (href.startsWith('/')) {
                        fullUrl = 'https://sex-masry.site' + href;
                    }

                    const id = 'sexmasry:' + Buffer.from(fullUrl).toString('base64');
                    
                    if (img) { // إضافته فقط إذا وجدنا صورة له لضمان جودة العرض
                        metas.push({
                            id: id,
                            type: 'movie',
                            name: title.substring(0, 50), // تقصير العنوان لو طويل جداً
                            poster: img
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

        return {
            streams: [
                {
                    title: 'Direct Stream ⚡',
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
