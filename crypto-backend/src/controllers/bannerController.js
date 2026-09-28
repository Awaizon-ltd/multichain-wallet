// src/controllers/bannerController.js
const pool = require("../config/pool");

const MAX_BANNERS = 5;

// Every column except the image bytes — keeps list responses lean
const META_COLUMNS = `id, title, subtitle, description, cta_label, cta_url,
  "order", active, badge, created_at, updated_at`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a DB row to the API shape the app expects (`_id`, camelCase) */
const toBanner = (row) => ({
  _id: row.id,
  title: row.title,
  subtitle: row.subtitle,
  description: row.description,
  ctaLabel: row.cta_label,
  ctaUrl: row.cta_url,
  order: row.order,
  active: row.active,
  badge: row.badge,
  imageUrl: `/api/banners/image/${row.id}`,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const trim = (v) => (typeof v === "string" ? v.trim() : v);
const toBool = (v) => v === "true" || v === true;

const notFound = (res, message = "Banner not found") =>
  res.status(404).json({ success: false, message });

/** Translate Postgres errors into the same HTTP responses the API used before */
const handleDbError = (res, err, order) => {
  switch (err.code) {
    case "22P02": // invalid uuid in the URL
      return notFound(res);
    case "23505": // unique "order" slot
      return res.status(409).json({
        success: false,
        message: `Order slot ${order} is already taken. Choose a different order (1–5).`,
      });
    case "23514": // CHECK ("order" BETWEEN 1 AND 5)
      return res
        .status(400)
        .json({ success: false, message: "Order must be between 1 and 5" });
    case "23502": // NOT NULL (e.g. missing title)
    case "22001": // value too long
      return res.status(400).json({ success: false, message: err.message });
    default:
      return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/banners ─────────────────────────────────────────────────────────
/** Returns banners sorted by order (no binary image data) */
const getAllBanners = async (req, res) => {
  try {
    const where = req.query.includeInactive === "true" ? "" : "WHERE active";
    const { rows } = await pool.query(
      `SELECT ${META_COLUMNS} FROM banners ${where} ORDER BY "order"`,
    );
    res.json({ success: true, data: rows.map(toBanner) });
  } catch (err) {
    handleDbError(res, err);
  }
};

// ─── GET /api/banners/:id ─────────────────────────────────────────────────────
const getBannerById = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${META_COLUMNS} FROM banners WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return notFound(res);
    res.json({ success: true, data: toBanner(rows[0]) });
  } catch (err) {
    handleDbError(res, err);
  }
};

// ─── GET /api/banners/image/:id ───────────────────────────────────────────────
/** Serves the raw image binary with correct Content-Type header */
const getBannerImage = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT image_data, image_content_type FROM banners WHERE id = $1",
      [req.params.id],
    );
    if (!rows[0]) return notFound(res, "Image not found");

    res.set("Content-Type", rows[0].image_content_type);
    res.set("Cache-Control", "public, max-age=86400"); // 24h cache
    res.send(rows[0].image_data);
  } catch (err) {
    if (err.code === "22P02") return notFound(res, "Image not found");
    handleDbError(res, err);
  }
};

// ─── POST /api/banners ────────────────────────────────────────────────────────
const createBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Image file is required" });
    }

    const { title, subtitle, description, order, ctaLabel, ctaUrl, badge, active } =
      req.body;

    if (!trim(title)) {
      return res
        .status(400)
        .json({ success: false, message: "Title is required" });
    }

    // Validate we haven't hit the 5-banner limit
    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM banners",
    );
    if (countRows[0].count >= MAX_BANNERS) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum of 5 banners allowed. Delete one before creating another.",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO banners
         (title, subtitle, description, "order", cta_label, cta_url, badge,
          active, image_data, image_content_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${META_COLUMNS}`,
      [
        trim(title),
        trim(subtitle) || "",
        trim(description) || "",
        Number(order),
        trim(ctaLabel) || "Learn More",
        trim(ctaUrl) || "",
        trim(badge) || "",
        active !== undefined ? toBool(active) : true,
        req.file.buffer,
        req.file.mimetype,
      ],
    );

    res.status(201).json({ success: true, data: toBanner(rows[0]) });
  } catch (err) {
    handleDbError(res, err, req.body.order);
  }
};

// ─── PUT /api/banners/:id ─────────────────────────────────────────────────────
const updateBanner = async (req, res) => {
  try {
    const { title, subtitle, description, order, ctaLabel, ctaUrl, badge, active } =
      req.body;

    // Only update the fields that were sent
    const fields = {
      title: trim(title),
      subtitle: trim(subtitle),
      description: trim(description),
      order: order !== undefined ? Number(order) : undefined,
      cta_label: trim(ctaLabel),
      cta_url: trim(ctaUrl),
      badge: trim(badge),
      active: active !== undefined ? toBool(active) : undefined,
    };
    // Replace image only if a new file is uploaded
    if (req.file) {
      fields.image_data = req.file.buffer;
      fields.image_content_type = req.file.mimetype;
    }

    const sets = ["updated_at = NOW()"];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val === undefined) continue;
      values.push(val);
      sets.push(`"${col}" = $${values.length}`);
    }
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE banners SET ${sets.join(", ")}
       WHERE id = $${values.length}
       RETURNING ${META_COLUMNS}`,
      values,
    );
    if (!rows[0]) return notFound(res);

    res.json({ success: true, data: toBanner(rows[0]) });
  } catch (err) {
    handleDbError(res, err, req.body.order);
  }
};

// ─── DELETE /api/banners/:id ──────────────────────────────────────────────────
const deleteBanner = async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM banners WHERE id = $1", [
      req.params.id,
    ]);
    if (!rowCount) return notFound(res);

    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (err) {
    handleDbError(res, err);
  }
};

// ─── PATCH /api/banners/:id/toggle ───────────────────────────────────────────
const toggleBannerActive = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE banners SET active = NOT active, updated_at = NOW()
       WHERE id = $1 RETURNING id, active`,
      [req.params.id],
    );
    if (!rows[0]) return notFound(res);

    res.json({ success: true, data: { _id: rows[0].id, active: rows[0].active } });
  } catch (err) {
    handleDbError(res, err);
  }
};

module.exports = {
  getAllBanners,
  getBannerById,
  getBannerImage,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActive,
};
