# Voice challenge entry

ElevenLabs Scribe v2 transcribes recordings on the authenticated `/api/voice/transcribe` endpoint. On Create challenge, select Title, Mission, or Evidence requirements, record up to 60 seconds (or upload supported audio up to 3 MB), and explicitly select **Transcribe audio**. Edit the transcript, then select **Add to draft**. Existing field text is preserved unless Replace existing text is checked. Category, points, and deadline use the ordinary form controls. Publishing is always a separate action.

## Configuration

Create a restricted ElevenLabs API key with only **Speech to Text: Access**. Leave other endpoints and administration permissions disabled; leave auto-disable if leaked enabled. Set a credit limit appropriate for the pilot. Save `ELEVENLABS_API_KEY` as a Vercel **Secret** for Production and Preview; never prefix it with `NEXT_PUBLIC_`. New deployments pick up the variable. For local development, add a separate development key to the ignored `.env.local` file.

The app remains usable through manual entry without the key. Config reports only whether the key exists; no key value reaches the browser. A configured key is not proof that the account has transcription credits or that its permissions are correct.

## Privacy and limits

Recordings stay in browser memory until the user explicitly requests transcription. Zyvara does not write audio or raw transcripts to its database or logs. ElevenLabs processes the audio under its own retention policy; this implementation does not claim enterprise zero retention. The provider gets a generic filename and no member ID. Only text added to the draft and explicitly published becomes saved challenge content.

Origin checks, member authentication, a persisted five-request-per-minute member throttle, and a bounded multipart body protect the endpoint. Files must be nonempty and use a supported audio MIME type. The provider decodes and validates actual audio; file extensions alone are not trusted. A 45-second provider timeout, 55-second client timeout, cancellation, microphone cleanup, and generic provider error messages keep failures recoverable. The 3 MB limit stays below Vercel's request-body limit, including multipart overhead.

## Verification

Unit tests cover bounded chunked uploads, file types and sizes, malformed multipart, missing configuration, Scribe request options, transcript length/shape, and provider error redaction. Browser tests use an explicitly mocked transcription endpoint for deterministic UI validation; live account/credit validation requires a real audio sample. No production mock transcription fallback is shipped.

Official endpoint reference: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
