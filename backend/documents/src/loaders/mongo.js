import mongoose from "mongoose";

/**
 * Connect to MongoDB.
 * Default services are no longer pre-seeded here since the pipeline now uses
 * a dynamic ordered steps array defined by each user's annotation configuration.
 * Users can add services via the annotation-configuration UI.
 */
export const mongoLoader = async () => {
  try {
    console.log("Setup mongodb...", process.env.MONGO);
    await mongoose.connect(process.env.MONGO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected.");
  } catch (err) {
    console.error(err);
    throw new Error("Couldn't not connect to DB.");
  }
};
