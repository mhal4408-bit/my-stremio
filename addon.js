const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const builder = new addonBuilder({
    id: 'org.sexmasry.addon',
    version: '1.0.3',
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

        for (let page = 1; page <= 3; page++) {
            let pageUrl = page === 1 ? 'https://sex-masry.site/' : `https://sex-masry.site/page/${page}/`;
            
            try {
                const response = await axios.get(pageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': 'https://sex-masry.site/'
                    },
                    timeout: 5000
                });

                const $ = cheerio.load(response.data);

                $('a').each((index, element) => {
                    const el = $(element);
                    const href = el.attr('href');
                    
                    if (href && (href.includes('/movie/') || href.includes('/post/') || el.find('img').length > 0)) {
                        if (!seenLinks.has(href)) {
                            seenLinks.add(href);

                            const title = el.attr('title') || el.find('img').attr('alt') || el.text().trim() || `Movie ${metas.length + 1}`;
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
                            
                            if (img && title.length > 2) {
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
                console.log(`Skipped page ${page} due to error`);
            }
        }

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

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://sex-masry.site/'
            }
        });

        const $ = cheerio.load(response.data);
        let videoUrl = '';

        const sourceAttr = $('video source').attr('src') || $('iframe').attr('src') || $('video').attr('src');
        
        if (sourceAttr) {
            videoUrl = sourceAttr;
            if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
        } else {
            $('a').each((i, el) => {
                let href = $(el).attr('href');
                if (href && (href.endsWith('.mp4') || href.includes('embed') || href.includes('video'))) {
                    videoUrl = href;
                }
            });
        }

        const finalStreamUrl = videoUrl || targetUrl;

        return {
            streams: [
                {
                    title: 'Watch Direct Video ⚡',
                    url: finalStreamUrl
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
