import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client) return client;
  client = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
  client.on('error', (err) => console.error('Redis Client Error', err));
  await client.connect();
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } finally {
    client = null;
  }
}
