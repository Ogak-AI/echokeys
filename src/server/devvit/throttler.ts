/**
 * Client-side throttler for progress events
 * Run on client to prevent flooding server with updates
 */

export class ProgressThrottler {
  private lastSendTime = 0;
  private readonly minIntervalMs = 100; // 100ms minimum between updates

  shouldSend(): boolean {
    const now = Date.now();
    if (now - this.lastSendTime >= this.minIntervalMs) {
      this.lastSendTime = now;
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastSendTime = 0;
  }
}
