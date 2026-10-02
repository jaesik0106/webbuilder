const express = require("express");
const pageService = require("../services/pageService");
const siteSettings = require("../services/siteSettingsService");

const router = express.Router();

// 메인 페이지 (방문자가 / 로 들어왔을 때)
router.get("/home", async (req, res) => {
  try {
    const page = await pageService.getHomePage();
    return res.json({ success: true, page });
  } catch (error) {
    console.error("Get public home failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "홈페이지를 불러오지 못했습니다." });
  }
});

// 서브 페이지 (방문자가 /about 처럼 페이지 주소로 들어왔을 때)
router.get("/pages/:slug", async (req, res) => {
  try {
    const page = await pageService.getPageBySlug(String(req.params.slug).toLowerCase());
    if (!page) {
      return res.status(404).json({ success: false, message: "페이지를 찾을 수 없습니다." });
    }
    return res.json({ success: true, page });
  } catch (error) {
    console.error("Get public page failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "페이지를 불러오지 못했습니다." });
  }
});

// 사이트 설정 중 방문자 화면에 필요한 값 (제목, 로고, 파비콘, 추가 CSS, 스크립트 등)
router.get("/site", async (req, res) => {
  try {
    return res.json({ success: true, settings: await siteSettings.getPublic() });
  } catch (error) {
    console.error("Get site settings failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "사이트 설정을 불러오지 못했습니다." });
  }
});

// 배포 서버는 /robots.txt, /sitemap.xml 을 이 주소로 보낸다 (php-api/site.htaccess)
router.get("/robots.txt", async (req, res) => {
  res.type("text/plain").send(await siteSettings.robotsTxt());
});

router.get("/sitemap.xml", async (req, res) => {
  res.type("application/xml").send(await siteSettings.sitemapXml(`${req.protocol}://${req.get("host")}`));
});

module.exports = router;
