const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessTtl });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshTtl });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken };
