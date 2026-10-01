const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const pool = require("./db/pool");
const { initDb, migrateDb } = require("./db/init");
const { ensureAdmin } = require("./services/authService");
const authRoutes = require("./routes/auth");
const pageRoutes = require("./routes/pages");
const aiRoutes = require("./routes/ai");
const publicRoutes = require("./routes/public");
const files = require("./routes/files");

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/files", files.router);
app.use("/uploads", express.static(files.UPLOAD_DIR, { maxAge: "7d" }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Web Builder API is running",
  });
});

app.get("/api/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      success: true,
      message: "Database connection is working",
    });
  } catch (error) {
    console.error("Database: connection failed", error.code || "", error.sqlMessage || error.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.listen(port, async () => {
  console.log(`API Server: http://localhost:${port}`);

  try {
    await pool.query("SELECT 1");
    await initDb();
    await migrateDb();
    await ensureAdmin();
    console.log("Database: connected");
  } catch (error) {
    console.error("Database: connection failed", error.code || "", error.sqlMessage || error.message);
  }
});
