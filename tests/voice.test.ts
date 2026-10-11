import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/server/errors";
import {
  readVoiceUpload,
  transcribeVoice,
  MAX_VOICE_BYTES,
} from "../src/server/voice";

function upload(blob: Blob) {
  const body = new FormData();
  body.append("audio", blob, "private-name.wav");
  return new Request("http://localhost/api/voice/transcribe", {
    method: "POST",
    body,
  });
}
const status = (expected: number) => (error: unknown) =>
  error instanceof AppError && error.status === expected;

test("voice uploads accept audio and reject empty, wrong-type, malformed, and oversized bodies", async () => {
  assert.equal(
    (
      await readVoiceUpload(
        upload(new Blob(["audio"], { type: "audio/webm;codecs=opus" })),
      )
    ).size,
    5,
  );
  await assert.rejects(
    readVoiceUpload(upload(new Blob([], { type: "audio/wav" }))),
    status(400),
  );
  await assert.rejects(
    readVoiceUpload(upload(new Blob(["x"], { type: "text/html" }))),
    status(415),
  );
  await assert.rejects(
    readVoiceUpload(
      upload(
        new Blob([new Uint8Array(MAX_VOICE_BYTES + 1)], { type: "audio/wav" }),
      ),
    ),
    status(413),
  );
  await assert.rejects(
    readVoiceUpload(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=broken" },
        body: "invalid",
      }),
    ),
    status(400),
  );
  // No content-length: streaming bodies must still have a hard limit.
  const streamed = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(MAX_VOICE_BYTES + 16_385));
        c.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readVoiceUpload(streamed), status(413));
});

test("ElevenLabs is server-only, sends Scribe options, returns only plain text, and redacts provider failures", async () => {
  const previous = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "unit-test-key";
  const file = new File(["audio"], "private-name.wav", { type: "audio/wav" });
  try {
    const result = await transcribeVoice(
      file,
      undefined,
      async (url, options) => {
        assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
        assert.deepEqual(options?.headers, { "xi-api-key": "unit-test-key" });
        const form = options?.body as FormData;
        assert.equal(form.get("model_id"), "scribe_v2");
        assert.equal((form.get("file") as File).name, "challenge-audio");
        assert.equal(form.get("tag_audio_events"), "false");
        return Response.json({
          text: " Clean the park. ",
          accountSecret: "should-not-escape",
        });
      },
    );
    assert.deepEqual(result, { text: "Clean the park." });
    for (const providerStatus of [401, 403, 429, 422, 500]) {
      await assert.rejects(
        transcribeVoice(
          file,
          undefined,
          async () =>
            new Response("private upstream details", {
              status: providerStatus,
            }),
        ),
        (error: unknown) =>
          error instanceof AppError &&
          !error.message.includes("private upstream") &&
          !error.message.includes("unit-test-key"),
      );
    }
    await assert.rejects(
      transcribeVoice(file, undefined, async () =>
        Response.json({ text: "  " }),
      ),
      status(422),
    );
    await assert.rejects(
      transcribeVoice(file, undefined, async () =>
        Response.json({ text: "x".repeat(6001) }),
      ),
      status(422),
    );
    await assert.rejects(
      transcribeVoice(file, undefined, async () => {
        throw new Error("unit-test-key");
      }),
      status(503),
    );
    delete process.env.ELEVENLABS_API_KEY;
    await assert.rejects(
      transcribeVoice(file, undefined, async () => {
        assert.fail("must not call provider without a key");
      }),
      status(503),
    );
  } finally {
    if (previous === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previous;
  }
});
