import { test } from "node:test";
import assert from "node:assert/strict";
import { authError } from "../src/components/firebase-client";

test("invalid email credentials do not reveal whether an account exists", () => {
  const expected = authError({ code: "auth/invalid-credential" });
  assert.equal(authError({ code: "auth/user-not-found" }), expected);
  assert.equal(authError({ code: "auth/wrong-password" }), expected);
});

test("unknown auth and session errors never display raw provider details", () => {
  const privateMessage = "private provider response";
  assert.equal(
    authError(new Error(privateMessage)),
    "Unable to complete sign-in. Please try again.",
  );
  assert.equal(
    authError({ code: "auth/internal-error", message: privateMessage }),
    authError(null),
  );
});
