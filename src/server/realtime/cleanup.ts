import { spectatorController } from './spectatorController';
import { globalPubSub } from './pubsub';
import { disconnectRedis } from './redisClient';

export async function gracefulCleanup() {
  // Close all spectator sessions gracefully
  try {
    // spectatorController handles closing sockets per session
    // iterative close: get session ids from controller internals is not exposed
    // instead rely on controller cleanup by server shutdown path
  } catch (err) {
    console.error('Error during cleanup', err);
  }

  try {
    await globalPubSub.close();
  } catch (err) {
    console.error('Error closing pubsub', err);
  }

  try {
    await disconnectRedis();
  } catch (err) {
    console.error('Error disconnecting redis', err);
  }
}
