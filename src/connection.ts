import { ConnectionOptionsSchema } from "./schema.ts";
import type {
  ConnectionOptionsType,
  SessionContext,
  TransactionContext,
  TransactionRunOptions,
} from "./types.ts";
import { MongoClient } from "mongodb";
import type { ClientSession } from "mongodb";
import { OmyMongoError } from "./errors.ts";
import { Logger } from "./logger.ts";

export class ConnectionError extends OmyMongoError {
  constructor(message: string) {
    super("CONNECTION_ERROR", message);
    this.name = "ConnectionError";
  }
}

export class Connection {
  static instance: Connection;
  static getInstance(options?: ConnectionOptionsType) {
    if (!Connection.instance && !options) {
      throw new ConnectionError(
        "Connection instance not initialized. Please provide connection options.",
      );
    }

    if (!Connection.instance && options) {
      Connection.instance = new Connection(options);
    }

    return Connection.instance;
  }

  client: MongoClient | null = null;

  options: ConnectionOptionsType;

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
      Logger.error("Failed to disconnect from MongoDB:", error);
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

  async startSession(): Promise<ClientSession> {
    await this.connect();
    try {
      return this.client!.startSession();
    } catch (error) {
      console.error("Failed to start MongoDB session:", error);
      await this.disconnect();
      Logger.error("Failed to start MongoDB session:", error);
      throw new ConnectionError("Failed to start MongoDB session");
    }
  }

  async withSession<T>(fn: (context: SessionContext) => Promise<T>): Promise<T> {
    const session = await this.startSession();
    try {
      return await fn({ session });
    } finally {
      await session.endSession();
      await this.disconnect();
    }
  }

  async withTransaction<T>(
    fn: (context: TransactionContext) => Promise<T>,
    options?: TransactionRunOptions,
  ): Promise<T> {
    return this.withSession(async ({ session }) => {
      let hasResult = false;
      let result: T | undefined;

      await session.withTransaction(async () => {
        result = await fn({ session });
        hasResult = true;
      }, options);

      if (!hasResult) {
        throw new ConnectionError("Transaction aborted before completion");
      }

      return result as T;
    });
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

export const startSession = async () => {
  const connection = Connection.getInstance();
  return connection.startSession();
};

export const withSession = async <T>(fn: (context: SessionContext) => Promise<T>) => {
  const connection = Connection.getInstance();
  return connection.withSession(fn);
};

export const withTransaction = async <T>(
  fn: (context: TransactionContext) => Promise<T>,
  options?: TransactionRunOptions,
) => {
  const connection = Connection.getInstance();
  return connection.withTransaction(fn, options);
};
