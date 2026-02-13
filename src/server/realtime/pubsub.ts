import { getRedisClient } from './redisClient';

type PubSubHandler = (message: any) => Promise<void> | void;

export class RedisPubSub {
  private subscriber: any = null;
  private publisher: any = null;

  async init() {
    const client = await getRedisClient();
    // publisher uses the same client instance
    this.publisher = client;
    // create a separate subscriber client
    const { createClient } = require('redis');
    this.subscriber = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
    this.subscriber.on('error', (e: Error) => console.error('Redis subscriber error', e));
    await this.subscriber.connect();
  }

  async publish(channel: string, payload: object) {
    if (!this.publisher) throw new Error('Publisher not initialized');
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: PubSubHandler) {
    if (!this.subscriber) await this.init();
    await this.subscriber.subscribe(channel, (message: string) => {
      try {
        const parsed = JSON.parse(message);
        handler(parsed);
      } catch (err) {
        console.error('Failed to parse message', err);
      }
    });
  }

  async unsubscribe(channel: string) {
    if (!this.subscriber) return;
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (err) {
      console.error('Unsubscribe error', err);
    }
  }

  async close() {
    try {
      if (this.subscriber) await this.subscriber.quit();
    } catch {}
    this.subscriber = null;
  }
}

export const globalPubSub = new RedisPubSub();
