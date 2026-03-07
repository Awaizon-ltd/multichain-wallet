const Joi = require("joi");

// ── Schema for POST /api/wallets/bind ────────────────────
// chain is intentionally removed — all supported chains are EVM-compatible
// and share the same address format. The backend stores 'EVM' as the canonical value.
const bindWalletSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(64).required().messages({
    "string.alphanum": "Username may only contain letters and numbers.",
    "string.min": "Username must be at least 3 characters.",
  }),
  email: Joi.string().email().max(320).required().messages({
    "string.email": "Please provide a valid email address.",
  }),
  wallet_address: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required()
    .messages({
      "string.pattern.base":
        "Wallet address must be a valid EVM address (0x + 40 hex characters).",
    }),
});

// ── Schema for GET /api/wallets/resolve ──────────────────
const resolveWalletSchema = Joi.object({
  email_or_username: Joi.string().min(3).max(320).required().messages({
    "string.min": "Value must be at least 3 characters.",
    "any.required": "`email_or_username` query param is required.",
  }),
});

// ── Middleware factory ───────────────────────────────────
function validate(schema, source = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(
      source === "query" ? req.query : req.body,
      { abortEarly: false, stripUnknown: true },
    );

    if (error) {
      return res.status(422).json({
        success: false,
        code: "VALIDATION_ERROR",
        errors: error.details.map((d) => d.message),
      });
    }

    if (source === "query") req.validatedQuery = value;
    else req.validatedBody = value;

    next();
  };
}

module.exports = {
  validateBind: validate(bindWalletSchema, "body"),
  validateResolve: validate(resolveWalletSchema, "query"),
};
