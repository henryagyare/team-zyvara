import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readVoiceUpload, transcribeVoice } from "../src/server/voice";

loadEnvConfig(process.cwd());
const audioPath = process.argv[2];
if (!audioPath)
  throw new Error("Usage: pnpm exec tsx scripts/verify-voice.ts <audio-file>");
const types: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};
async function main() {
  const body = new FormData();
  body.append(
    "audio",
    new Blob([await readFile(audioPath)], {
      type:
        types[path.extname(audioPath).toLowerCase()] ||
        "application/octet-stream",
    }),
    "test-audio",
  );
  const file = await readVoiceUpload(
    new Request("http://localhost", { method: "POST", body }),
  );
  const result = await transcribeVoice(file);
  // Confirm connectivity without exposing the transcript, audio, or credentials.
  console.log(
    `ElevenLabs transcription succeeded (${result.text.length} characters).`,
  );
}
main().catch(() => {
  console.error(
    "Voice verification failed. Check the key's speech-to-text permission, available credits, and the audio file.",
  );
  process.exitCode = 1;
});
