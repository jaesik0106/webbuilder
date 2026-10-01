const express = require("express");
const { requireAuth } = require("../middleware/auth");
const aiService = require("../services/aiService");

const router = express.Router();

router.use(requireAuth);

router.get("/usage", async (req, res) => {
  try {
    const usage = await aiService.listUsage(req.user.id);
    res.json({ success: true, usage });
  } catch (error) {
    console.error("List AI usage failed", error.code || error.message);
    res.status(500).json({ success: false, message: "사용량을 불러오지 못했습니다." });
  }
});

router.post("/revise", async (req, res) => {
  const prompt = String(req.body.prompt || "").trim();
  const pageId = req.body.pageId;

  if (prompt.length > 2000) {
    return res.status(413).json({ success: false, message: "수정 요청이 너무 깁니다." });
  }

  if (!prompt) {
    return res.status(400).json({ success: false, message: "수정 내용을 입력하세요." });
  }

  if (!pageId) {
    return res.status(400).json({ success: false, message: "페이지가 필요합니다." });
  }

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const proposal = await aiService.proposeEdits(req.user.id, pageId, {
      prompt,
      page: req.body.page,
      selectedBlockId: req.body.selectedBlockId,
      catalog: req.body.catalog,
    }, controller.signal);
    if (controller.signal.aborted || res.writableEnded) return;
    if (!proposal) {
      return res.status(404).json({ success: false, message: "페이지를 찾을 수 없습니다." });
    }

    // 저장하지 않고 제안만 돌려준다. 고객이 에디터에서 적용하면 기존 자동 저장이 저장한다.
    return res.json({ success: true, ...proposal });
  } catch (error) {
    if (error.name === "AbortError" || controller.signal.aborted || res.writableEnded) return;
    const status = error.status || 500;
    console.error("Revise page failed", error.message);
    return res.status(status).json({
      success: false,
      message: error.status ? error.message : "AI 수정에 실패했습니다.",
    });
  }
});

module.exports = router;
