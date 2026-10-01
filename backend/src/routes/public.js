const express = require("express");
const pageService = require("../services/pageService");

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

module.exports = router;
