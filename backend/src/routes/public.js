const express = require("express");
const pageService = require("../services/pageService");

const router = express.Router();

router.get("/home", async (req, res) => {
  try {
    const page = await pageService.getLatestPage();
    return res.json({ success: true, page });
  } catch (error) {
    console.error("Get public home failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "홈페이지를 불러오지 못했습니다." });
  }
});

module.exports = router;
