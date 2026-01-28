import { useCallback, useEffect, useRef, useState } from 'react';

type RoomState = {
  id: string;
  challengeId?: string;
  players: Record<string, { username: string; position: number; finished: boolean }>;
};

export const useMultiplayer = () => {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const createRoom = useCallback(async (challengeId?: string) => {
    const res = await fetch('/api/multiplayer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId }),
    });
    const data = await res.json();
    return data.roomId as string;
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    const es = new EventSource(`/api/multiplayer/stream/${roomId}`);
    es.addEventListener('state', (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data);
        setRoomState(parsed);
      } catch (_) {}
    });
    es.addEventListener('finished', (ev: MessageEvent) => {
      // pass-through finished events too
      try {
        const parsed = JSON.parse(ev.data);
        // attach a small event to roomState so UI can react
        setRoomState(prev => ({ ...(prev as any), lastFinished: parsed.username } as any));
      } catch (_) {}
    });
    eventSourceRef.current = es;
  }, []);

  const leaveRoom = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setRoomState(null);
  }, []);

  const sendUpdate = useCallback(async (roomId: string, payload: { username: string; position: number; finished?: boolean }) => {
    await fetch(`/api/multiplayer/update/${roomId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  return { roomState, createRoom, joinRoom, leaveRoom, sendUpdate };
};
