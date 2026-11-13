/**
 * Tiny web server: serves the browser client and mints LiveKit access tokens
 * so the browser can join a room. The agent worker auto-joins new rooms.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET (see .env.example).');
  process.exit(1);
}

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use(express.static(publicDir));
// Serve the LiveKit browser SDK straight from node_modules (no CDN needed).
app.use(
  '/vendor',
  express.static(path.join(publicDir, '..', 'node_modules', 'livekit-client', 'dist')),
);

app.get('/api/token', async (_req, res) => {
  const roomName = `avatar-${randomUUID().slice(0, 8)}`;
  const identity = `user-${randomUUID().slice(0, 8)}`;
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, ttl: '1h' });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  res.json({ url: LIVEKIT_URL, token: await token.toJwt(), roomName, identity });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Open http://localhost:${port}`));
