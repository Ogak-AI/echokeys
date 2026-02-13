/*
 Lightweight load test script to simulate N spectators across M sessions and multiple instances.
 Usage: node loadtest/loadtest.js [spectators] [sessions] [concurrency]
 Example: node loadtest/loadtest.js 1000 50 10
*/
const WebSocket = require('ws');

const [, , sCount = '1000', sessions = '50', concurrency = '10'] = process.argv;
const SPECTATORS = Number(sCount);
const SESSIONS = Number(sessions);
const CONCURRENCY = Number(concurrency);

function randSession() {
  return `session-${Math.floor(Math.random() * SESSIONS)}`;
}

async function connectOne(id) {
  return new Promise((res) => {
    const sessionId = randSession();
    const ws = new WebSocket(`ws://localhost:3000/spectator?sessionId=${sessionId}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'JOIN', sessionId }));
      res(ws);
    });
    ws.on('error', (e) => {
      console.error('ws error', e.message);
      res(null);
    });
  });
}

async function run() {
  console.log('Starting load test', { SPECTATORS, SESSIONS, CONCURRENCY });
  const batch = Math.ceil(SPECTATORS / CONCURRENCY);
  for (let b = 0; b < batch; b++) {
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      const id = b * CONCURRENCY + i;
      if (id >= SPECTATORS) break;
      promises.push(connectOne(id));
    }
    const results = await Promise.all(promises);
    const connected = results.filter(Boolean).length;
    console.log(`Batch ${b + 1}/${batch} connected ${connected}`);
  }
  console.log('Load test finished connecting clients. Keep server monitoring externally.');
}

run().catch(console.error);
