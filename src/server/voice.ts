import { z } from "zod";
import { AppError } from "./errors";

export const MAX_VOICE_BYTES = 3 * 1024 * 1024;
export const voiceConfigured = () => !!process.env.ELEVENLABS_API_KEY?.trim();
const audioTypes = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/flac",
  "audio/x-m4a",
]);

// Bound the stream before multipart parsing, including chunked requests.
export async function readVoiceUpload(request: Request): Promise<File> {
  const limit = MAX_VOICE_BYTES + 16_384;
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new AppError(413, "Choose an audio file up to 3 MB.");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;"))
    throw new AppError(400, "Send a recording or audio file.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "An audio file is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) {
        await reader.cancel();
        throw new AppError(413, "Choose an audio file up to 3 MB.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new AppError(400, "This audio upload could not be read.");
  }
  const files = form.getAll("audio");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File) || !file.size)
    throw new AppError(400, "Choose one nonempty audio file.");
  if (file.size > MAX_VOICE_BYTES)
    throw new AppError(413, "Choose an audio file up to 3 MB.");
  if (!audioTypes.has(file.type.split(";")[0].toLowerCase()))
    throw new AppError(
      415,
      "Use WebM, Ogg, MP4, MP3, WAV, AAC, or FLAC audio.",
    );
  return file;
}

export async function transcribeVoice(
  file: File,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ text: string }> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key)
    throw new AppError(
      503,
      "Voice entry is not configured yet. You can still type your challenge.",
    );
  const form = new FormData();
  // Do not send the user's filename or any member identifiers to the provider.
  form.append("file", file, "challenge-audio");
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  form.append("timestamps_granularity", "none");
  let response: Response;
  try {
    response = await fetcher("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
      signal: AbortSignal.any([
        AbortSignal.timeout(45_000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (!response.ok) {
      // Never expose provider bodies, which can include sensitive account details.
      if (response.status === 429)
        throw new AppError(
          429,
          "Voice entry is busy or has reached its usage limit. Try later or type your challenge.",
        );
      if (response.status === 400 || response.status === 422)
        throw new AppError(
          400,
          "The audio could not be transcribed. Try a clearer recording or another audio format.",
        );
      throw new AppError(
        503,
        "Voice entry is temporarily unavailable. You can still type your challenge.",
      );
    }
    const parsed = z
      .object({ text: z.string().trim().min(1).max(6000) })
      .safeParse(await response.json());
    if (!parsed.success)
      throw new AppError(
        422,
        "No usable speech was found. Try a short, clear recording.",
      );
    return { text: parsed.data.text };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      503,
      "Voice transcription could not finish. Please try again or type your challenge.",
    );
  }
}
