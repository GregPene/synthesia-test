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

// Example avatar ID from the LiveKit plugin docs; your workspace may not have access to it.
// Set SYNTHESIA_AVATAR_ID to an avatar your workspace can use (comma-separate up to 5 IDs;
// the first is shown, the others can be swapped in).
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

/** Tell the browser what the agent is doing, via participant attributes. */
async function setStage(ctx: JobContext, stage: string, error = '') {
  try {
    await ctx.room.localParticipant?.setAttributes({ 'avatar.stage': stage, 'avatar.error': error });
  } catch (err) {
    console.warn('could not publish status attributes', err);
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log(`Agent joined room ${ctx.room.name}`);

    if (!process.env.SYNTHESIA_API_KEY) {
      const msg = 'SYNTHESIA_API_KEY is not set in .env';
      console.error(msg);
      await setStage(ctx, 'error', msg);
      ctx.shutdown(msg);
      return;
    }

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
    console.log(`Starting Synthesia avatar ${avatarIds[0]} in room ${ctx.room.name}...`);
    await setStage(ctx, 'starting_avatar');
    try {
      await avatar.start(session, ctx.room);
    } catch (err) {
      const detail =
        err instanceof synthesia.SynthesiaError
          ? `${err.message} [type=${err.type ?? 'unknown'} status=${err.status ?? '-'}]`
          : String(err);
      console.error(`Synthesia avatar failed to start: ${detail}`);
      // Surface the failure to the browser, then leave the room.
      await setStage(ctx, 'error', detail);
      await new Promise((r) => setTimeout(r, 1000));
      ctx.shutdown(detail);
      return;
    }
    console.log(`Synthesia avatar session started: ${avatar.sessionId}`);

    await session.start({ agent: new Assistant(), room: ctx.room });

    session.generateReply({
      instructions: 'Greet the user warmly in one sentence and ask how you can help.',
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
