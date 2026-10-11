import { test, expect, type Page } from "@playwright/test";

// Exercise the real Firebase browser SDK with intercepted provider responses.
// No accounts are created and no password-reset emails are sent by this suite.
async function setup(page: Page) {
  let signedIn = false;
  let displayName = "Email member";
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    return (
      [
        { alg: "RS256", typ: "JWT" },
        {
          sub: "email-test",
          user_id: "email-test",
          name: displayName,
          iat: now,
          exp: now + 3600,
          auth_time: now,
          aud: "zyvara-3753d",
          iss: "https://securetoken.google.com/zyvara-3753d",
          firebase: { sign_in_provider: "password" },
        },
      ]
        .map((value) =>
          Buffer.from(JSON.stringify(value)).toString("base64url"),
        )
        .join(".") + ".test-signature"
    );
  };
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { demo: false, firebaseConfigured: true } }),
  );
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["idToken"]);
      expect(typeof body.idToken).toBe("string");
      expect(
        JSON.parse(
          Buffer.from(body.idToken.split(".")[1], "base64url").toString(),
        ).name,
      ).toBe(displayName);
      signedIn = true;
    }
    await route.fulfill({
      json: {
        member: signedIn
          ? { id: "email-test", name: displayName, admin: false }
          : null,
      },
    });
  });
  await page.route(
    "https://identitytoolkit.googleapis.com/**",
    async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON();
      calls.push({ endpoint, body });
      if (endpoint.endsWith("accounts:sendOobCode")) {
        await route.fulfill({
          status: 400,
          json: { error: { message: "EMAIL_NOT_FOUND" } },
        });
      } else if (endpoint.endsWith("accounts:update")) {
        displayName = String(body.displayName);
        await route.fulfill({
          json: {
            localId: "email-test",
            displayName,
            idToken: token(),
            refreshToken: "test-refresh",
            expiresIn: "3600",
          },
        });
      } else if (endpoint.endsWith("accounts:lookup")) {
        await route.fulfill({
          json: {
            users: [
              {
                localId: "email-test",
                email: "member@example.com",
                displayName,
                providerUserInfo: [
                  { providerId: "password", email: "member@example.com" },
                ],
              },
            ],
          },
        });
      } else {
        await route.fulfill({
          json: {
            localId: "email-test",
            email: "member@example.com",
            idToken: token(),
            refreshToken: "test-refresh",
            expiresIn: "3600",
          },
        });
      }
    },
  );
  await page.route("https://securetoken.googleapis.com/**", (route) =>
    route.fulfill({
      json: {
        access_token: token(),
        id_token: token(),
        refresh_token: "test-refresh",
        user_id: "email-test",
        expires_in: "3600",
      },
    }),
  );
  await page.goto("/signin?returnTo=/signin");
  await expect(
    page.getByRole("heading", { name: "Sign in with email" }),
  ).toBeVisible();
  return calls;
}

test("email signup validates confirmation and exchanges only the Firebase token", async ({
  page,
}) => {
  const calls = await setup(page);
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Display name").fill("New member");
  await page.getByLabel("Email address").fill("member@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByLabel("Confirm password").fill("different-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Your passwords do not match.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByLabel("Confirm password").fill("test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You are signed in" }),
  ).toBeVisible();
  expect(calls.some((call) => call.endpoint.endsWith("accounts:signUp"))).toBe(
    true,
  );
  expect(
    calls.find((call) => call.endpoint.endsWith("accounts:update"))?.body
      .displayName,
  ).toBe("New member");
});

test("email sign-in preserves Google and completes the token handoff", async ({
  page,
}) => {
  const calls = await setup(page);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await page.getByLabel("Email address").fill("member@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You are signed in" }),
  ).toBeVisible();
  expect(
    calls.some((call) => call.endpoint.endsWith("accounts:signInWithPassword")),
  ).toBe(true);
});

test("reset hides account existence and mode changes clear passwords on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page);
  await page.getByLabel("Email address").fill("member@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText(/If an account exists for this email/),
  ).toBeVisible();
  expect(
    calls.find((call) => call.endpoint.endsWith("accounts:sendOobCode"))?.body
      .requestType,
  ).toBe("PASSWORD_RESET");
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
