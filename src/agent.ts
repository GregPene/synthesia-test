/**
 * Voice agent that speaks through a Synthesia interactive avatar.
 *
 * Flow: the browser joins a LiveKit room -> this agent is dispatched into it ->
 * it asks Synthesia to start an interactive-avatar session in the same room ->
 * the avatar joins as its own participant and lip-syncs the agent's speech,
 * publishing audio + video that the browser renders.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as synthesia from '@livekit/agents-plugin-synthesia';

// A stock avatar from the Synthesia gallery. Override with SYNTHESIA_AVATAR_ID
// (comma-separate up to 5 IDs; the first is shown, the others can be swapped in).
const DEFAULT_AVATAR_ID = '03cee7ec-ac90-45ec-8c20-74a399cf3dc4';

class Assistant extends voice.Agent {
  constructor() {
    super({
      instructions:
        'You are a friendly, concise voice assistant shown to the user as a video avatar. ' +
        'Keep replies short and conversational, and never use markdown, emojis or lists, ' +
        'because everything you write is spoken aloud.',
    });
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    // STT/LLM/TTS run through LiveKit Inference, so only LiveKit + Synthesia
    // credentials are needed. Swap in any plugin (OpenAI, Deepgram, ...) here.
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: 'deepgram/nova-3:en',
      llm: 'openai/gpt-4.1-mini',
      tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
    });

    const avatarIds = (process.env.SYNTHESIA_AVATAR_ID ?? DEFAULT_AVATAR_ID)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const avatar = new synthesia.AvatarSession(new synthesia.AvatarConfig({ avatarIds }));

    // Must start before session.start(): it reroutes the agent's audio to the avatar.
    await avatar.start(session, ctx.room);
    console.log(`Synthesia avatar session started: ${avatar.sessionId}`);

    await session.start({ agent: new Assistant(), room: ctx.room });

    session.generateReply({
      instructions: 'Greet the user warmly in one sentence and ask how you can help.',
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
