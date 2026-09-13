const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const SITE_URL = "https://web5.topcinema.fan";

const manifest = {
  id: "com.mycompany.topcinema",
  version: "1.0.0",
  name: "Top Cinema Addon",
  description: "سحب الأفلام تلقائياً من موقع Top Cinema",
  resources: ["catalog", "stream"],
  types: ["movie"],
  catalogs: [
    {
      type: "movie",
      id: "topcinema_movies",
      name: "Top Cinema - أحدث الأفلام"
    }
  ]
};

const builder = new addonBuilder(manifest);

// دالة جلب قائمة الأفلام من الصفحة الرئيسية
async function getTopCinemaCatalog() {
  try {
    const { data } = await axios.get(`${SITE_URL}/home1/`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const $ = cheerio.load(data);
    const movies = [];

    // تحديد كروت الأفلام من كود الصفحة
    $(".Small--Box, .MovieBlock, .Grid--Item").each((index, element) => {
      const title = $(element).find("h3, .Title").text().trim();
      const pageUrl = $(element).find("a").attr("href");
      const poster = $(element).find("img").attr("src") || $(element).find("img").attr("data-src");

      if (title && pageUrl) {
        // إنشاء ID فريد من رابط الصفحة لسهولة التتبع
        const id = "tc_" + Buffer.from(pageUrl).toString("base64");
        movies.push({
          id: id,
          type: "movie",
          name: title,
          poster: poster ? (poster.startsWith("http") ? poster : SITE_URL + poster) : "",
          description: `فيلم مأخوذ من Top Cinema: ${title}`
        });
      }
    });

    return movies;
  } catch (error) {
    console.error("خطأ في جلب الكتالوج:", error.message);
    return [];
  }
}

// دالة استخراج رابط التشغيل من صفحة الفيلم
async function getStreamUrl(base64PageUrl) {
  try {
    const pageUrl = Buffer.from(base64PageUrl, "base64").toString("utf-8");
    const { data } = await axios.get(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const $ = cheerio.load(data);

    // البحث عن روابط iFrame أو عناصر التشغيل داخل الصفحة
    const iframeSrc = $("iframe").attr("src");
    
    if (iframeSrc) {
      return iframeSrc;
    }
    
    return null;
  } catch (error) {
    console.error("خطأ في استخراج رابط البث:", error.message);
    return null;
  }
}

// معالج الكتالوج
builder.defineCatalogHandler(async ({ type, id }) => {
  if (type === "movie" && id === "topcinema_movies") {
    const metas = await getTopCinemaCatalog();
    return { metas };
  }
  return { metas: [] };
});

// معالج روابط التشغيل
builder.defineStreamHandler(async ({ type, id }) => {
  if (type === "movie" && id.startsWith("tc_")) {
    const base64PageUrl = id.replace("tc_", "");
    const streamUrl = await getStreamUrl(base64PageUrl);

    if (streamUrl) {
      return {
        streams: [
          {
            title: "سيرفر Top Cinema",
            url: streamUrl
          }
        ]
      };
    }
  }
  return { streams: [] };
});

module.exports = builder.getInterface();