declare module '@devvit/web/client' {
  export const context: { username?: string };
  export function navigateTo(target: string): Promise<void>;
  export function requestExpandedMode(event: Event | MouseEvent | unknown, screen: string): Promise<void>;
  export function connectRealtime<T>(options: {
    channel: string;
    onMessage: (message: T) => void;
  }): Promise<{ disconnect?: () => void }>;
}
