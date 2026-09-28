// src/routes/bannerRoutes.js
const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  getAllBanners,
  getBannerById,
  getBannerImage,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActive,
} = require("../controllers/bannerController");

// ─── Multer config (in-memory, 5 MB limit) ────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"), false);
    }
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Public routes (no auth required — add middleware here if needed)
router.get("/", getAllBanners);
router.get("/image/:id", getBannerImage); // Must come before /:id
router.get("/:id", getBannerById);

// Admin routes
router.post("/", upload.single("image"), createBanner);
router.put("/:id", upload.single("image"), updateBanner);
router.delete("/:id", deleteBanner);
router.patch("/:id/toggle", toggleBannerActive);

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Image too large. Max size is 5 MB.",
      });
    }
  }
  res.status(400).json({ success: false, message: err.message });
});

module.exports = router;
