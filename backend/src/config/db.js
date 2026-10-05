import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import config from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const persistentDbPath = path.resolve(__dirname, '../../data/mongo');

let memoryServer = null;

export async function connectDb() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2500 });
    console.log(`MongoDB connected: ${config.mongoUri}`);
    return;
  } catch (err) {
    console.warn(`Local MongoDB unavailable (${err.message}). Starting persistent demo MongoDB...`);
  }

  fs.mkdirSync(persistentDbPath, { recursive: true });

  memoryServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'appinop_ems',
      dbPath: persistentDbPath,
      storageEngine: 'wiredTiger',
    },
  });

  const uri = memoryServer.getUri();
  await mongoose.connect(uri);
  console.log(`Persistent demo MongoDB connected (${persistentDbPath})`);
}

export async function stopMemoryDb() {
  await mongoose.disconnect();
  // Keep dbPath on disk so removals survive API restarts.
  if (memoryServer) {
    await memoryServer.stop({ doCleanup: false, force: false });
    memoryServer = null;
  }
}
