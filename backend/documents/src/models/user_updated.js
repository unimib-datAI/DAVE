import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "12", 10);

const UserSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            default: () => crypto.randomUUID(),
            index: true,
        },
        name: {
            type: String,
            required: false,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    },
);

UserSchema.virtual("id").get(function () {
    return this.userId;
});

UserSchema.pre("save", function (next) {
    if (this.email && typeof this.email === "string") {
        this.email = this.email.toLowerCase().trim();
    }
    next();
});

UserSchema.methods.setPassword = async function (plainPassword) {
    if (!plainPassword || typeof plainPassword !== "string") {
        throw new Error("Password must be a non-empty string");
    }
    this.passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return this.passwordHash;
};

UserSchema.methods.validatePassword = async function (plainPassword) {
    try {
        if (!this.passwordHash) return false;
        return await bcrypt.compare(plainPassword, this.passwordHash);
    } catch (err) {
        return false;
    }
};

/**
 * Static method: ensure a default admin exists.
 * Called on app startup after DB connection.
 */
UserSchema.statics.ensureDefaultAdmin = async function () {
    const User = this;
    const count = await User.countDocuments({});
    
    if (count === 0) {
        const adminEmail = (process.env.ADMIN_EMAIL || "admin@daveadmin.com")
            .toLowerCase()
            .trim();
        const adminPassword = process.env.ADMIN_PASSWORD || "daveAdmin42!";

        const user = new User({
            name: "Admin",
            email: adminEmail,
            role: "admin",
        });
        await user.setPassword(adminPassword);
        await user.save();
        console.log(`✅ Created default admin user: ${adminEmail}`);
        return user;
    }
    return null;
};

export const User = mongoose.model("User", UserSchema, "users");
export default User;
