import { ConnectionOptionsSchema } from "./schema.ts";
import type { ConnectionOptionsType } from "./types.ts";
import { MongoClient } from "mongodb";
import { OmyMongoError } from "./errors.ts";

export class ConnectionError extends OmyMongoError {
  constructor(message: string) {
    super("CONNECTION_ERROR", message);
    this.name = "ConnectionError";
  }
}

export class Connection {
  static instance: Connection;
  static getInstance(options?: ConnectionOptionsType) {
    if(!Connection.instance && !options) {
      throw new ConnectionError("Connection instance not initialized. Please provide connection options.");
    }

    if (!Connection.instance && options) {
      Connection.instance = new Connection(options);
    }
    
    return Connection.instance;
  }

  private client: MongoClient | null = null;

  private options: ConnectionOptionsType;

  connection_counter = 0;

  constructor(options: ConnectionOptionsType) {
    this.options = ConnectionOptionsSchema.parse(options);
  }

  async connect() {
    this.client ||= new MongoClient(this.options.uri, {
      appName: this.options.appName,
      maxPoolSize: this.options.maxPoolSize,
      minPoolSize: this.options.minPoolSize,
    });

    try {
      if (this.connection_counter < 1) await this.client.connect();
      this.connection_counter++;
      console.log("Connected to MongoDB successfully!");
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw new ConnectionError("Failed to connect to MongoDB");
    }
  }

  async disconnect() {
    try {
      if (!this.client) return;

      if (this.connection_counter > 1) {
        this.connection_counter--;
        return;
      }

      await this.client.close();
      this.client = null;
      this.connection_counter = 0;
      console.log("Disconnected from MongoDB successfully!");
    } catch (error) {
      throw new ConnectionError("Failed to disconnect from MongoDB");
    }
  }

  async withLifetime<T>(fn: (client: MongoClient) => Promise<T>): Promise<T> {
    await this.connect();
    try {
      return await fn(this.client!);
    } finally {
      await this.disconnect();
    }
  }
}

export const createConnection = (options: ConnectionOptionsType) => {
  return Connection.getInstance(options);
};

export const connect = async (options: ConnectionOptionsType) => {
  const connection = createConnection(options);
  await connection.connect();
  return connection;
};

export const disconnect = async () => {
  if (!Connection.instance) return;
  await Connection.instance.disconnect();
};
