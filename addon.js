const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// 1. تعريف الإضافة (Manifest)
const builder = new addonBuilder({
    id: "org.myarabicaddon",
    version: "1.0.0",
    name: "إضافتي الخاصة",
    description: "إضافة تجريبية لمحتوى الأقسام العربية",
    types: ["movie"],
    catalogs: [
        {
            type: "movie",
            id: "my_custom_catalog",
            name: "أفلام عربية تجريبية"
        }
    ],
    resources: ["catalog", "stream"]
});

// 2. معالجة طلب القائمة (Catalog Handler)
builder.defineCatalogHandler((args) => {
    if (args.type === "movie" && args.id === "my_custom_catalog") {
        return Promise.resolve({
            metas: [
                {
                    id: "tt0111161",
                    type: "movie",
                    name: "فيلم تجريبي 1",
                    poster: "https://via.placeholder.com/300x450.png?text=Movie+1",
                    description: "هذا وصف للفيلم التجريبي الأول"
                }
            ]
        });
    }
    return Promise.resolve({ metas: [] });
});

// 3. معالجة طلب روابط التشغيل (Stream Handler)
builder.defineStreamHandler((args) => {
    if (args.id === "tt0111161") {
        return Promise.resolve({
            streams: [
                {
                    title: "سيرفر مشاهدة HD",
                    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                }
            ]
        });
    }
    return Promise.resolve({ streams: [] });
});

// 4. تشغيل خادم الإضافة محلياً
serveHTTP(builder.getInterface(), { port: 7000 });
console.log("الإضافة تعمل الآن على: http://127.0.0.1:7000/manifest.json");