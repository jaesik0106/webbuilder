const express = require("express");
const { requireAuth } = require("../middleware/auth");
const pageService = require("../services/pageService");

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const pages = await pageService.listPages(req.user.id);
    res.json({ success: true, pages });
  } catch (error) {
    console.error("List pages failed", error.code || error.message);
    res.status(500).json({ success: false, message: "페이지 목록을 불러오지 못했습니다." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const page = await pageService.getPage(req.user.id, req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, message: "페이지를 찾을 수 없습니다." });
    }

    return res.json({ success: true, page });
  } catch (error) {
    console.error("Get page failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "페이지를 불러오지 못했습니다." });
  }
});

router.post("/", async (req, res) => {
  const config = req.body.config;
  const validationError = pageService.validateConfig(config);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  try {
    const page = await pageService.createPage(req.user.id, req.body.name, config);
    return res.status(201).json({
      success: true,
      message: "페이지를 저장했습니다.",
      page,
    });
  } catch (error) {
    console.error("Create page failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "페이지를 저장하지 못했습니다." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await pageService.deletePage(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "페이지를 찾을 수 없습니다." });
    }

    return res.json({ success: true, message: "페이지를 삭제했습니다." });
  } catch (error) {
    console.error("Delete page failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "페이지를 삭제하지 못했습니다." });
  }
});

router.put("/:id", async (req, res) => {
  const config = req.body.config;
  if (config !== undefined) {
    const validationError = pageService.validateConfig(config);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }
  }

  try {
    const page = await pageService.updatePage(req.user.id, req.params.id, req.body.name, config);
    if (!page) {
      return res.status(404).json({ success: false, message: "페이지를 찾을 수 없습니다." });
    }

    return res.json({
      success: true,
      message: "페이지를 수정했습니다.",
      page,
    });
  } catch (error) {
    console.error("Update page failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "페이지를 수정하지 못했습니다." });
  }
});

module.exports = router;
