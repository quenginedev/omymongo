import { MongoMemoryServer } from "mongodb-memory-server";
import { Logger } from "../src/logger";

export default async function setup() {
  Logger.log("Setting up in-memory MongoDB server for integration tests...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  Logger.log("In-memory MongoDB server started at:", uri);

  return async () => {
    await mongod.stop();
  };
}
