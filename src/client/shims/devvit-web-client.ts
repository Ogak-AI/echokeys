/**
 * Devvit web client shim.
 *
 * In production on Reddit, `@devvit/web/client` provides the real context
 * including the authenticated Reddit username and navigation APIs.
 * This shim wraps those imports with graceful fallbacks for local development.
 */

import type { LeaderboardUpdate } from '../../shared/types/index';

type DevvitContext = { username?: string };

type RealtimeConnection = {
  disconnect?: () => void;
};

// Use a shared object reference so property updates are visible to all imports
export const context: DevvitContext = {};

let _navigateTo: (target: string) => Promise<void> = async (target: string) => {
  if (target.startsWith('http://') || target.startsWith('https://')) {
    window.open(target, '_blank', 'noopener,noreferrer');
  } else {
    window.location.assign(target);
  }
};

let _requestExpandedMode: (event: Event | MouseEvent | unknown, screen: string) => Promise<void> = async (
  _event,
  screen: string
) => {
  const target = screen.endsWith('.html') ? screen : `${screen}.html`;
  window.location.assign(target);
};

let _connectRealtime: (options: {
  channel: string;
  onMessage: (message: LeaderboardUpdate) => void;
}) => Promise<RealtimeConnection | null> = async () => null;

// Asynchronously load the real Devvit environment if available
import('@devvit/web/client')
  .then((devvitWeb) => {
    if (devvitWeb.context) {
      Object.assign(context, devvitWeb.context);
    }
    if (devvitWeb.navigateTo) {
      _navigateTo = devvitWeb.navigateTo as (target: string) => Promise<void>;
    }
    if (devvitWeb.requestExpandedMode) {
      _requestExpandedMode = devvitWeb.requestExpandedMode as (
        event: Event | MouseEvent | unknown,
        screen: string
      ) => Promise<void>;
    }
    if (devvitWeb.connectRealtime) {
      _connectRealtime = devvitWeb.connectRealtime as typeof _connectRealtime;
    }
  })
  .catch(() => {
    // Running outside Devvit — fallbacks are active
  });

export const navigateTo = (target: string) => _navigateTo(target);
export const requestExpandedMode = (event: Event | MouseEvent | unknown, screen: string) =>
  _requestExpandedMode(event, screen);
export const connectRealtime = (options: {
  channel: string;
  onMessage: (message: LeaderboardUpdate) => void;
}) => _connectRealtime(options);

