import type { Auth, User } from "firebase/auth";
import { send } from "./api";

export async function clientAuth() {
  const { initializeApp, getApps } = await import("firebase/app");
  const sdk = await import("firebase/auth");
  const app =
    getApps()[0] ||
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  const auth = sdk.getAuth(app);
  await sdk.setPersistence(auth, sdk.inMemoryPersistence);
  return { auth, sdk };
}

export async function exchangeSession(auth: Auth, user: User) {
  const { signOut } = await import("firebase/auth");
  try {
    await send("session", { idToken: await user.getIdToken(true) });
  } finally {
    await signOut(auth);
  }
}

export function authError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Check your email and password and try again.";
    case "auth/email-already-in-use":
      return "Unable to create this account. Try signing in or resetting your password. If you joined with Google, continue with Google.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a stronger password with at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a little and try again.";
    case "auth/network-request-failed":
      return "Check your internet connection and try again.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed. You can try again.";
    case "auth/operation-not-allowed":
      return "This sign-in method is temporarily unavailable. Try Google or contact the organizer.";
    default:
      return "Unable to complete sign-in. Please try again.";
  }
}
