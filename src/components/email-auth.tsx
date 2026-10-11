"use client";

import { useState, type FormEvent } from "react";
import { Field } from "./shared";
import { authError, clientAuth, exchangeSession } from "./firebase-client";

export function EmailAuth({
  busy,
  disabled,
  setBusy,
  setError,
  onSignedIn,
}: {
  busy: boolean;
  disabled: boolean;
  setBusy: (value: boolean) => void;
  setError: (value: string) => void;
  onSignedIn: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  function changeMode(next: typeof mode) {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setNotice("");
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "signup" && !name.trim())
      return setError("Enter your display name.");
    if (mode === "signup" && password !== confirmation)
      return setError("Your passwords do not match.");
    setBusy(true);
    let client: Awaited<ReturnType<typeof clientAuth>> | undefined;
    try {
      client = await clientAuth();
      const { auth, sdk } = client;
      if (mode === "reset") {
        try {
          await sdk.sendPasswordResetEmail(auth, email.trim());
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "auth/user-not-found"
          ))
            throw error;
        }
        setNotice(
          "If an account exists for this email, you’ll receive a password reset link. Check your spam folder too.",
        );
        return;
      }
      const credential =
        mode === "signup"
          ? await sdk.createUserWithEmailAndPassword(
              auth,
              email.trim(),
              password,
            )
          : await sdk.signInWithEmailAndPassword(auth, email.trim(), password);
      if (mode === "signup")
        await sdk.updateProfile(credential.user, { displayName: name.trim() });
      await exchangeSession(auth, credential.user);
      setPassword("");
      setConfirmation("");
      await onSignedIn();
    } catch (error) {
      setError(authError(error));
    } finally {
      if (client) await client.sdk.signOut(client.auth).catch(() => {});
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <h2>
        {mode === "signup"
          ? "Create your account"
          : mode === "reset"
            ? "Reset your password"
            : "Sign in with email"}
      </h2>
      <fieldset disabled={busy || disabled} className="stack auth-fields">
        {mode === "signup" && (
          <Field name="email-name" label="Display name">
            <input
              id="email-name"
              required
              maxLength={80}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        <Field name="email-address" label="Email address">
          <input
            id="email-address"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {mode !== "reset" && (
          <Field
            name="email-password"
            label="Password"
            help={
              mode === "signup"
                ? "Use at least 6 characters. A longer, unique password is better."
                : undefined
            }
          >
            <input
              id="email-password"
              type="password"
              required
              minLength={mode === "signup" ? 6 : undefined}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              aria-describedby={
                mode === "signup" ? "email-password-help" : undefined
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {mode === "signup" && (
          <Field name="email-confirm" label="Confirm password">
            <input
              id="email-confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
        )}
        <button className="btn full">
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : mode === "reset"
                ? "Send reset link"
                : "Sign in"}
        </button>
        <div className="auth-links">
          {mode !== "signin" && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => changeMode("signin")}
            >
              Back to sign in
            </button>
          )}
          {mode === "signin" && (
            <>
              <button
                type="button"
                className="btn secondary"
                onClick={() => changeMode("signup")}
              >
                Create an account
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => changeMode("reset")}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>
      </fieldset>
      {notice && (
        <p className="auth-message" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
