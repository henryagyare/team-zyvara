"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { api } from "./api";
import { useSession } from "./app";
import { ErrorNotice } from "./shared";

export type VoiceField = "title" | "description" | "requirements";
const labels: Record<VoiceField, string> = {
  title: "Challenge title",
  description: "Mission",
  requirements: "Evidence requirements",
};
const MAX_BYTES = 3 * 1024 * 1024;

export function VoiceChallenge({
  onApply,
  disabled,
}: {
  onApply: (field: VoiceField, text: string, replace: boolean) => boolean;
  disabled: boolean;
}) {
  const { config } = useSession();
  const [field, setField] = useState<VoiceField>("description");
  const [phase, setPhase] = useState<
    "idle" | "requesting" | "recording" | "ready" | "transcribing" | "review"
  >("idle");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const locked =
    phase === "requesting" || phase === "recording" || phase === "transcribing";
  const limit = field === "title" ? 80 : 2000;

  function releaseMic() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  function discard() {
    generation.current++;
    controller.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    setAudio(null);
    setText("");
    setPhase("idle");
    setError("");
  }
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function record() {
    if (locked || disabled) return;
    discard();
    setNotice("");
    setPhase("requesting");
    setSeconds(0);
    const current = generation.current;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable in this browser. Upload an audio file instead.",
        );
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(mic, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
      });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let bytes = 0;
      recording.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
        }
        if (bytes > MAX_BYTES && recording.state === "recording")
          recording.stop();
      };
      recording.onerror = () => {
        if (current !== generation.current) return;
        discard();
        setError("The microphone stopped working. Try again or upload audio.");
      };
      recording.onstop = () => {
        if (current !== generation.current) return;
        releaseMic();
        const blob = new Blob(chunks, {
          type: recording.mimeType || "audio/webm",
        });
        if (!blob.size || blob.size > MAX_BYTES) {
          setPhase("idle");
          setError("Record a shorter clip, up to 3 MB.");
          return;
        }
        setAudio(blob);
        setPhase("ready");
      };
      recording.start(1000);
      setPhase("recording");
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= 60 && recording.state === "recording") recording.stop();
      }, 1000);
    } catch (error) {
      if (current !== generation.current) return;
      releaseMic();
      setPhase("idle");
      setError(
        error instanceof DOMException
          ? "Microphone access was unavailable. Allow it in your browser or upload an audio file."
          : error instanceof Error
            ? error.message
            : "Recording could not start.",
      );
    }
  }
  async function transcribe() {
    if (!audio || locked || disabled) return;
    setPhase("transcribing");
    setError("");
    setNotice("");
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 55_000);
    const body = new FormData();
    body.append("audio", audio, "challenge-audio");
    try {
      const result = await api<{ text: string }>("voice/transcribe", {
        method: "POST",
        body,
        signal: abort.signal,
      });
      if (current !== generation.current) return;
      setText(result.text);
      setPhase("review");
      setAudio(null);
    } catch (error) {
      if (current !== generation.current) return;
      setPhase("ready");
      setError(
        abort.signal.aborted
          ? "Transcription timed out. Try again or type your challenge."
          : error instanceof Error
            ? error.message
            : "Transcription failed. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  return (
    <section className="panel voice-entry" aria-labelledby="voice-heading">
      <h2 id="voice-heading">
        <Mic size={20} aria-hidden="true" /> Add your challenge by voice
      </h2>
      <p className="muted">
        Dictate a title, mission, or evidence requirements. Review each
        transcript before adding it to your draft.
      </p>
      <p className="small muted">
        Audio is sent to ElevenLabs only when you select Transcribe audio.
        Zyvara does not save recordings. Avoid private information; ElevenLabs
        processes audio under its own retention policy.
      </p>
      {!config?.voiceConfigured ? (
        <p className="feedback-note">
          Voice entry is not configured yet. You can still type your challenge
          below.
        </p>
      ) : (
        <>
          <label htmlFor="voice-field">Add voice text to</label>
          <select
            id="voice-field"
            value={field}
            disabled={locked || disabled}
            onChange={(e) => setField(e.target.value as VoiceField)}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="voice-actions">
            {phase === "recording" ? (
              <button
                type="button"
                className="btn"
                onClick={() => recorder.current?.stop()}
              >
                <Square size={16} aria-hidden="true" /> Stop recording
              </button>
            ) : (
              <button
                type="button"
                className="btn secondary"
                disabled={locked || disabled}
                onClick={record}
              >
                <Mic size={16} aria-hidden="true" /> Record audio
              </button>
            )}
            <label className="voice-upload">
              Or upload audio (up to 3 MB)
              <input
                type="file"
                accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,audio/aac,audio/flac,audio/x-m4a,.m4a"
                disabled={locked || disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  discard();
                  setNotice("");
                  if (!file.size || file.size > MAX_BYTES) {
                    setError("Choose a nonempty audio file up to 3 MB.");
                    return;
                  }
                  setAudio(file);
                  setPhase("ready");
                }}
              />
            </label>
          </div>
          <p role="status" aria-live="polite" className="small">
            {phase === "recording"
              ? `Recording: ${seconds} / 60 seconds`
              : phase === "requesting"
                ? "Waiting for microphone permission…"
                : phase === "ready"
                  ? "Audio ready. Transcribe it when you are ready to send it."
                  : phase === "transcribing"
                    ? "Transcribing with ElevenLabs…"
                    : notice}
          </p>
          {(phase === "ready" || phase === "transcribing") && (
            <button
              type="button"
              className="btn"
              disabled={locked || disabled}
              onClick={transcribe}
            >
              Transcribe audio
            </button>
          )}
          {phase === "review" && (
            <div className="stack">
              <label htmlFor="voice-transcript">
                Review transcript for {labels[field].toLowerCase()}
              </label>
              <textarea
                id="voice-transcript"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={disabled}
                aria-describedby="voice-count voice-guidance"
              />
              <p id="voice-count" className="helper">
                {text.length} / {limit.toLocaleString()} characters
              </p>
              <p id="voice-guidance" className="small muted">
                Correct anything misheard.
                {field === "requirements"
                  ? " Put one requirement per line (up to 500 characters each)."
                  : ""}{" "}
                Nothing is published yet.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={replace}
                  disabled={disabled}
                  onChange={(e) => setReplace(e.target.checked)}
                />{" "}
                Replace existing text in this field
              </label>
              <button
                type="button"
                className="btn"
                disabled={disabled || !text.trim() || text.length > limit}
                onClick={() => {
                  if (onApply(field, text.trim(), replace)) {
                    discard();
                    setNotice(
                      `Transcript added to ${labels[field].toLowerCase()}. Review the form before publishing.`,
                    );
                  } else
                    setError(
                      "The combined text is too long. Shorten it or select Replace existing text.",
                    );
                }}
              >
                Add to draft
              </button>
            </div>
          )}
          {phase !== "idle" && (
            <button type="button" className="btn secondary" onClick={discard}>
              Discard voice entry
            </button>
          )}
        </>
      )}
      {error && <ErrorNotice message={error} />}
    </section>
  );
}
