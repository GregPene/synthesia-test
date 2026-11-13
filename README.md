# Synthesia interactive avatar (minimal)

A talking Synthesia avatar you can have a voice conversation with in the browser.

```
browser (mic + video) ──► LiveKit room ◄── voice agent (STT → LLM → TTS)
                                 ▲                 │ audio
                                 └── Synthesia avatar (lip-syncs, publishes video+audio)
```

- `src/agent.ts` — LiveKit voice agent. It starts a Synthesia interactive-avatar session
  (`POST https://developers.synthesia.io/api/interactive-avatars/sessions`, via
  `@livekit/agents-plugin-synthesia`). The avatar joins the room and speaks the agent's replies.
- `src/server.ts` — serves the web client and mints LiveKit tokens at `/api/token`.
- `public/index.html` — the browser client: shows the avatar video, captures your mic, and shows a live transcript.

## Requirements

- Node 20+
- A Synthesia API key with interactive avatars enabled
- A LiveKit Cloud project. STT, LLM and TTS go through LiveKit Inference, so you don't need any other keys.

## Run

```bash
npm install
cp .env.example .env   # fill in SYNTHESIA_API_KEY and LIVEKIT_* values
npm run download-files # one-time: fetches the Silero VAD model
```

Run these in two terminals:

```bash
npm run agent
```

```bash
npm run web
```

Open http://localhost:3000, press **Start** and allow microphone access. The avatar joins after a few seconds and greets you.

## Customize

- **Avatar**: set `SYNTHESIA_AVATAR_ID` to any gallery avatar ID in your workspace (up to 5, comma-separated).
- **Personality**: edit `instructions` in `src/agent.ts`.
- **Models / voice**: change the `stt`, `llm` and `tts` strings in `src/agent.ts`.
