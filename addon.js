const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const builder = new addonBuilder({
    id: 'org.sexmasry.addon',
    version: '1.0.5',
    name: 'Sex Masry Addon',
    description: 'Stremio Addon for Sex Masry',
    types: ['movie'],
    catalogs: [
        {
            type: 'movie',
            id: 'sexmasry_catalog',
            name: 'Sex Masry Movies',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ],
    resources: ['catalog', 'stream']
});

builder.defineCatalogHandler(async function(args) {
    try {
        let metas = [];
        let seenLinks = new Set();
        let skip = args.extra && args.extra.skip ? parseInt(args.extra.skip) : 0;
        let pageNum = Math.floor(skip / 20) + 1;
        let targetPages = [pageNum, pageNum + 1];

        for (let page of targetPages) {
            let pageUrl = page === 1 ? 'https://sex-masry.site/' : `https://sex-masry.site/page/${page}/`;
            
            try {
                const response = await axios.get(pageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': 'https://sex-masry.site/'
                    },
                    timeout: 6000
                });

                const $ = cheerio.load(response.data);

                $('article, .post, .item, div[class*="post"], div[class*="movie"]').each((index, element) => {
                    const el = $(element);
                    const linkObj = el.find('a').first();
                    const href = linkObj.attr('href');
                    
                    if (href) {
                        if (!seenLinks.has(href)) {
                            seenLinks.add(href);

                            const title = el.find('h2, h3, .title, .Title').text().trim() || linkObj.attr('title') || `Movie`;
                            let img = el.find('img').attr('data-src') || el.find('img').attr('src') || '';

                            if (img.startsWith('//')) {
                                img = 'https:' + img;
                            } else if (img && !img.startsWith('http')) {
                                img = 'https://sex-masry.site' + img;
                            }

                            let fullUrl = href;
                            if (href.startsWith('/')) {
                                fullUrl = 'https://sex-masry.site' + href;
                            }

                            const id = 'sexmasry:' + Buffer.from(fullUrl).toString('base64');
                            
                            if (img && title.length > 1) {
                                metas.push({
                                    id: id,
                                    type: 'movie',
                                    name: title.substring(0, 60),
                                    poster: img
                                });
                            }
                        }
                    }
                });
            } catch (err) {
                console.log(`Could not load page ${page}`);
            }
        }

        if (metas.length === 0) {
            const fallbackRes = await axios.get('https://sex-masry.site/', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const $ = cheerio.load(fallbackRes.data);
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const img = $(el).find('img').attr('src');
                if (href && img && !seenLinks.has(href)) {
                    seenLinks.add(href);
                    let fullUrl = href.startsWith('/') ? 'https://sex-masry.site' + href : href;
                    metas.push({
                        id: 'sexmasry:' + Buffer.from(fullUrl).toString('base64'),
                        type: 'movie',
                        name: $(el).text().trim() || 'Video',
                        poster: img.startsWith('//') ? 'https:' + img : img
                    });
                }
            });
        }

        return { metas: metas };
    } catch (e) {
        console.error("Error fetching catalog:", e);
        return { metas: [] };
    }
});

// معالجة تشغيل الفيديو واستخراج الروابط المباشرة لتعمل داخل المشغل
builder.defineStreamHandler(async function(args) {
    try {
        const encodedUrl = args.id.replace('sexmasry:', '');
        const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf8');

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://sex-masry.site/'
            }
        });

        const $ = cheerio.load(response.data);
        let videoSources = [];

        // 1. البحث عن وسوم الفيديو المباشرة
        $('video source, video').each((i, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                videoSources.append ? videoSources.push(src) : videoSources.push(src);
            }
        });

        // 2. البحث عن إطارات الـ iframe الخاصة بالمشغلات الخارجية
        $('iframe').each((i, el) => {
            let iframeSrc = $(el).attr('src') || $(el).attr('data-src');
            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                videoSources.push(iframeSrc);
            }
        });

        // 3. البحث في الروابط النصية عن امتدادات الفيديو أو أزرار التحميل/المشاهدة
        $('a').each((i, el) => {
            let h = $(el).attr('href');
            if (h && (h.includes('.mp4') || h.includes('.m3u8') || h.includes('embed') || h.includes('player'))) {
                videoSources.push(h);
            }
        });

        // بناء قائمة الـ streams لكي يظهر خيار التشغيل للمشغل الداخلي
        let streams = [];
        if (videoSources.length > 0) {
            // تصفية الروابط المتكررة
            let uniqueSources = [...new Set(videoSources)];
            uniqueSources.forEach((src, index) => {
                streams.push({
                    title: `Direct Stream [${index + 1}] ⚡`,
                    url: src
                });
            });
        } else {
            // كخيار أخیر لو الموقع محمي بالكامل، نعرض رابط الصفحة
            streams.push({
                title: 'Open Source Web 🌐',
                url: targetUrl
            });
        }

        return { streams: streams };
    } catch (e) {
        console.error("Error fetching stream:", e);
        return { streams: [] };
    }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
