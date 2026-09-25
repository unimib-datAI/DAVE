// Ported from backend/documents/src/models/permissions.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPermission extends Document {
  collections: {
    create: string[];
    update: string[];
    delete: string[];
    view: string[];
    deAnonimize: string[];
  };
  document: {
    update: string[];
  };
  chat: {
    canUse: string[];
    canDevMode: string[];
  };
  settings: {
    anonymization: string[];
    llm: string[];
    pipeline: string[];
  };
}

export interface IPermissionModel extends Model<IPermission> {
  ensureDefaultPermissions(): Promise<void>;
}

const permissionSchema = new Schema<IPermission>({
  collections: {
    create: { type: [String], default: ['editor'] },
    update: { type: [String], default: ['editor'] },
    delete: { type: [String], default: ['editor'] },
    view: { type: [String], default: ['editor', 'viewer'] },
    deAnonimize: { type: [String], default: ['editor'] },
  },
  document: {
    update: { type: [String], default: ['editor'] },
  },
  chat: {
    canUse: { type: [String], default: ['editor, viewer'] },
    canDevMode: { type: [String], default: ['editor'] },
  },
  settings: {
    anonymization: {
      type: [String],
      default: ['editor'],
    },
    llm: {
      // by default all users allowed to use the chat can
      // change the parameters regarding the llm address, model and key
      // other settings allowed only if role is allowed
      type: [String],
      default: ['editor'],
    },
    pipeline: { type: [String], default: ['editor'] },
  },
});

export const PermissionModel: IPermissionModel =
  (mongoose.models.Permission as IPermissionModel) ||
  (mongoose.model<IPermission, IPermissionModel>(
    'Permission',
    permissionSchema
  ) as IPermissionModel);

(PermissionModel as any).ensureDefaultPermissions = async function () {
  const count = await PermissionModel.countDocuments({});
  if (count === 0) {
    await PermissionModel.create({
      collections: {
        create: ['editor'],
        update: ['editor'],
        delete: ['editor'],
        view: ['editor', 'viewer'],
        deAnonimize: ['editor'],
      },
      document: {
        update: ['editor'],
      },
      chat: {
        canUse: ['editor', 'viewer'],
        canDevMode: ['editor'],
      },
      settings: {
        anonymization: ['editor'],
        llm: ['editor'],
        pipeline: ['editor'],
      },
    });
    console.log('✅ Default permissions document created.');
  }
};
