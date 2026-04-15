import mongoose, { Schema } from "mongoose";

const permissionSchema = new Schema({
  collections: {
    create: { type: [String], default: ["editor"] },
    update: { type: [String], default: ["editor"] },
    delete: { type: [String], default: ["editor"] },
    view: { type: [String], default: ["editor", "viewer"] },
    deAnonimize: { type: [String], default: ["editor"] },
  },
  document: {
    update: { type: [String], default: ["editor"] },
  },
  chat: {
    canUse: { type: [String], default: ["editor, viewer"] },
    canDevMode: { type: [String], default: ["editor"] },
  },
  settings: {
    anonymization: {
      type: [String],
      default: ["editor"],
    },
    llm: {
      // by default all users allowed to use the chat can
      // change the parameters regarding the llm address, model and key
      // other settings allowed only if role is allowed
      type: [String],
      default: ["editor"],
    },
    pipeline: { type: [String], default: ["editor"] },
  },
});
export const Permission = mongoose.model("Permission", permissionSchema);

Permission.ensureDefaultPermissions = async function () {
  const count = await Permission.countDocuments({});
  if (count === 0) {
    await Permission.create({
      collections: {
        create: ["editor"],
        update: ["editor"],
        delete: ["editor"],
        view: ["editor", "viewer"],
        deAnonimize: ["editor"],
      },
      document: {
        update: ["editor"],
      },
      chat: {
        canUse: ["editor", "viewer"],
        canDevMode: ["editor"],
      },
      settings: {
        anonymization: ["editor"],
        llm: ["editor"],
        pipeline: ["editor"],
      },
    });
    console.log("✅ Default permissions document created.");
  }
};

export default Permission;
