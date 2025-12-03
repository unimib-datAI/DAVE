import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema({
    token: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now() },
});

export const RefreshToken = mongoose.model("RefreshToken", RefreshTokenSchema);
