import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  buildPasswordResetRedirect,
  RECOVERY_FLAG_KEY,
  hasAuthLinkError,
  initialRecoveryFlag,
  isRecoveryCallback,
  leaveRecoverySession,
  newPasswordErrorField,
  nextRecoveryFlag,
  readRecoveryFlag,
  recoveryRedirect,
  resetRequestErrorKey,
  signOutOtherDevicesIfAsked,
  updatePasswordErrorKey,
  validateNewPassword,
  validateResetEmail,
  writeRecoveryFlag,
} from "./passwordReset.ts";

// --- The e-mail the user types on "Forgot your password?" -----------------
assert.equal(validateResetEmail(""), "auth.error.emailRequired");
assert.equal(validateResetEmail("   "), "auth.error.emailRequired");
assert.equal(validateResetEmail("ana@"), "auth.error.emailInvalid");
assert.equal(validateResetEmail("ana correo.com"), "auth.error.emailInvalid");
assert.equal(validateResetEmail("  ana@correo.com "), null, "surrounding spaces are ignored");

// --- Where the e-mail link sends the user --------------------------------
const ORIGIN = "http://localhost:5173";
assert.equal(
  buildPasswordResetRedirect("/reset-password", undefined, ORIGIN),
  "http://localhost:5173/reset-password",
  "without VITE_AUTH_REDIRECT_URL the current site is used",
);
assert.equal(
  buildPasswordResetRedirect("/reset-password", "   ", ORIGIN),
  "http://localhost:5173/reset-password",
  "a blank variable counts as not set",
);
assert.equal(
  buildPasswordResetRedirect("/reset-password", "https://fitmarket-ai.vercel.app/", ORIGIN),
  "https://fitmarket-ai.vercel.app/reset-password",
  "the configured base wins and its trailing slash is not doubled",
);
assert.equal(
  buildPasswordResetRedirect("/reset-password", "not a url", ORIGIN),
  "http://localhost:5173/reset-password",
  "a malformed variable falls back to the current site instead of sending a broken link",
);

// --- Never reveal whether an account exists -------------------------------
// Anything that is not a network problem or the per-IP request limit shows
// the same "if there is an account, we sent a link" message (null = that
// message).
assert.equal(resetRequestErrorKey(null), null);
assert.equal(resetRequestErrorKey({ message: "User not found", status: 400 }), null);
assert.equal(
  resetRequestErrorKey({ message: "Unable to validate email address: invalid format", status: 400 }),
  null,
);
assert.equal(resetRequestErrorKey({ message: "Database error finding user", status: 500 }), null);
// Supabase only applies the e-mail send limits ("once every 60 s", the hourly
// e-mail quota) when it actually sends a message, i.e. when the account
// exists. Saying "too many requests" would reveal that, so these show the
// neutral message too.
assert.equal(
  resetRequestErrorKey({ message: "email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" }),
  null,
  "the e-mail send limit only hits existing accounts",
);
assert.equal(
  resetRequestErrorKey({
    message: "For security purposes, you can only request this after 42 seconds.",
    status: 429,
    code: "over_email_send_rate_limit",
  }),
  null,
  "the per-user 60 s limit only hits existing accounts",
);
assert.equal(
  resetRequestErrorKey({ message: "For security purposes, you can only request this after 42 seconds.", status: 429 }),
  null,
  "same per-user limit from an older server without an error code",
);
assert.equal(
  resetRequestErrorKey({ message: "Too many requests", status: 429 }),
  null,
  "an unidentified 429 cannot be proven account-independent, so it stays neutral",
);
// The per-IP request limit does not depend on the account, so it is safe
// (and useful) to tell the user to wait.
assert.equal(
  resetRequestErrorKey({ message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" }),
  "auth.error.rateLimit",
);
assert.equal(
  resetRequestErrorKey({ message: "Failed to fetch", name: "AuthRetryableFetchError", status: 0 }),
  "errors.network",
);

// --- The new password, typed twice -----------------------------------------
assert.equal(MIN_PASSWORD_LENGTH, 8);
assert.equal(validateNewPassword("", ""), "auth.error.passwordRequired");
assert.equal(validateNewPassword("1234567", "1234567"), "auth.error.passwordTooShort");
assert.equal(validateNewPassword("12345678", "12345679"), "auth.error.passwordMismatch");
assert.equal(validateNewPassword("12345678", ""), "auth.error.passwordMismatch");
assert.equal(validateNewPassword("12345678", "12345678"), null);
assert.equal(validateNewPassword("        ", "        "), null, "spaces are valid password characters");

// Which field a validation error belongs to (it gets aria-invalid and focus).
assert.equal(newPasswordErrorField("auth.error.passwordRequired"), "password");
assert.equal(newPasswordErrorField("auth.error.passwordTooShort"), "password");
assert.equal(newPasswordErrorField("auth.error.passwordMismatch"), "confirmation");
assert.equal(newPasswordErrorField("auth.error.samePassword"), null, "server errors stay in the alert");
assert.equal(newPasswordErrorField(null), null);

// --- What to say when saving the new password fails -----------------------
assert.equal(
  updatePasswordErrorKey({ message: "New password should be different from the old password.", status: 422, code: "same_password" }),
  "auth.error.samePassword",
);
assert.equal(
  updatePasswordErrorKey({ message: "Password should contain at least one character of each: abc", status: 422, code: "weak_password" }),
  "auth.error.passwordWeak",
);
assert.equal(
  updatePasswordErrorKey({ message: "Auth session missing!", status: 400, name: "AuthSessionMissingError" }),
  "auth.error.resetLinkInvalid",
);
assert.equal(
  updatePasswordErrorKey({ message: "Session not found", status: 403, code: "session_not_found" }),
  "auth.error.resetLinkInvalid",
);
assert.equal(
  updatePasswordErrorKey({ message: "Reauthentication required", status: 400, code: "reauthentication_needed" }),
  "auth.error.resetLinkInvalid",
);
assert.equal(
  updatePasswordErrorKey({ message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" }),
  "auth.error.rateLimit",
);
assert.equal(
  updatePasswordErrorKey({ message: "Failed to fetch", name: "AuthRetryableFetchError", status: 0 }),
  "errors.network",
);
assert.equal(
  updatePasswordErrorKey({ message: "Something unexpected", status: 500 }),
  "auth.error.passwordUpdateFailed",
);

// --- Reading the link the user arrived with -------------------------------
// An expired or reused link comes back with the error in the hash (implicit
// flow) or in the query (PKCE flow).
assert.equal(
  hasAuthLinkError("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
  true,
);
assert.equal(hasAuthLinkError("?error=access_denied&error_code=otp_expired", ""), true);
assert.equal(hasAuthLinkError("", ""), false);
assert.equal(hasAuthLinkError("?lang=es", "#section"), false);

assert.equal(
  isRecoveryCallback("#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery"),
  true,
);
assert.equal(isRecoveryCallback("#access_token=abc&type=signup"), false);
assert.equal(isRecoveryCallback(""), false);
assert.equal(
  isRecoveryCallback("#type=recovery"),
  false,
  "a hand-typed #type=recovery without a session token must not start recovery mode",
);
assert.equal(isRecoveryCallback("#access_token=&type=recovery"), false, "an empty token does not count");

// --- Remembering that the session came from a recovery link ---------------
assert.equal(nextRecoveryFlag(false, "PASSWORD_RECOVERY"), true);
assert.equal(nextRecoveryFlag(true, "USER_UPDATED"), false, "the password was changed");
assert.equal(nextRecoveryFlag(true, "SIGNED_OUT"), false);
assert.equal(nextRecoveryFlag(true, "TOKEN_REFRESHED"), true, "a token refresh does not end recovery");
assert.equal(nextRecoveryFlag(true, "INITIAL_SESSION"), true);
assert.equal(nextRecoveryFlag(false, "SIGNED_IN"), false);
assert.equal(
  nextRecoveryFlag(true, "INITIAL_SESSION", false),
  false,
  "without a session a leftover flag is dropped, so it can never force anything",
);
assert.equal(nextRecoveryFlag(true, "TOKEN_REFRESHED", true), true);

// --- Surviving a page reload ----------------------------------------------
// Supabase removes the hash after reading it, but keeps the session. The
// flag is kept in sessionStorage so a reload on /reset-password cannot skip
// the new-password step.
function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}
const RECOVERY_HASH = "#access_token=abc&refresh_token=r&type=recovery";

{
  const storage = fakeStorage();
  assert.equal(readRecoveryFlag(storage), false, "nothing stored yet");
  assert.equal(initialRecoveryFlag("", storage), false);
  assert.equal(initialRecoveryFlag(RECOVERY_HASH, storage), true, "a valid recovery hash starts recovery");

  writeRecoveryFlag(storage, true);
  assert.equal(readRecoveryFlag(storage), true);
  assert.equal(initialRecoveryFlag("", storage), true, "after a reload (hash gone) recovery is still on");

  writeRecoveryFlag(storage, nextRecoveryFlag(true, "USER_UPDATED"));
  assert.equal(storage.data.has(RECOVERY_FLAG_KEY), false, "saving the password removes the stored flag");
  assert.equal(initialRecoveryFlag("", storage), false);

  writeRecoveryFlag(storage, true);
  writeRecoveryFlag(storage, nextRecoveryFlag(true, "SIGNED_OUT"));
  assert.equal(initialRecoveryFlag("", storage), false, "signing out removes the stored flag");

  storage.setItem(RECOVERY_FLAG_KEY, "yes");
  assert.equal(readRecoveryFlag(storage), false, "only the exact value we write counts");
}
{
  // Storage missing (old browser) or blocked (privacy mode): never crash.
  const throwing = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  assert.equal(readRecoveryFlag(throwing), false);
  assert.doesNotThrow(() => writeRecoveryFlag(throwing, true));
  assert.doesNotThrow(() => writeRecoveryFlag(throwing, false));
  assert.equal(readRecoveryFlag(null), false);
  assert.doesNotThrow(() => writeRecoveryFlag(null, true));
  assert.equal(initialRecoveryFlag(RECOVERY_HASH, throwing), true, "the hash alone still works");
}

// --- Keeping the user on the new-password screen --------------------------
const RESET = "/reset-password";
assert.equal(
  recoveryRedirect({ location: "/", resetPath: RESET, isRecovering: true, hasSession: true }),
  RESET,
  "a recovery link that landed on the home page (Site URL fallback) still opens the reset screen",
);
assert.equal(
  recoveryRedirect({ location: "/app/dashboard", resetPath: RESET, isRecovering: true, hasSession: true }),
  RESET,
  "the splash redirect cannot take the user to the app before the password is set",
);
assert.equal(
  recoveryRedirect({ location: RESET, resetPath: RESET, isRecovering: true, hasSession: true }),
  null,
  "already there: no redirect loop",
);
assert.equal(
  recoveryRedirect({ location: "/forgot-password", resetPath: RESET, isRecovering: true, hasSession: false }),
  null,
  "without a session (bad link) the user is free to ask for a new link",
);
assert.equal(
  recoveryRedirect({ location: "/app/dashboard", resetPath: RESET, isRecovering: false, hasSession: true }),
  null,
  "normal signed-in users are never redirected",
);

// --- Leaving the "link is no longer valid" screen -------------------------
// When saving fails with an expired session, the local session and the flag
// are still alive. "Ask for a new link" / "Back to sign in" must sign out
// first, otherwise the redirect above sends the user straight back.
{
  const calls = [];
  const error = await leaveRecoverySession(
    async () => {
      calls.push("signOut");
      return { error: null };
    },
    () => calls.push("navigate"),
  );
  assert.equal(error, null);
  assert.deepEqual(calls, ["signOut", "navigate"], "sign out first, then leave");
}
{
  const calls = [];
  const error = await leaveRecoverySession(
    async () => {
      calls.push("signOut");
      return { error: "errors.signOut" };
    },
    () => calls.push("navigate"),
  );
  assert.equal(error, "errors.signOut");
  assert.deepEqual(calls, ["signOut"], "if signing out fails, stay and show the error");
}
{
  // After signing out, the user is no longer forced back to the reset screen.
  const isRecovering = nextRecoveryFlag(true, "SIGNED_OUT", false);
  assert.equal(
    recoveryRedirect({ location: "/forgot-password", resetPath: RESET, isRecovering, hasSession: false }),
    null,
  );
  assert.equal(
    recoveryRedirect({ location: "/login", resetPath: RESET, isRecovering, hasSession: false }),
    null,
  );
  // Even if the session were still around for a moment, the flag is off.
  assert.equal(
    recoveryRedirect({ location: "/login", resetPath: RESET, isRecovering, hasSession: true }),
    null,
  );
}

// --- Optionally signing out the other devices after the change ------------
{
  // Box left unticked: nothing else happens.
  const calls = [];
  const client = { signOut: async (options) => { calls.push(options); return { error: null }; } };
  const result = await signOutOtherDevicesIfAsked(false, client);
  assert.deepEqual(result, { warningKey: null });
  assert.deepEqual(calls, [], "signOut is not called when the box is unticked");
}
{
  // Box ticked: only the OTHER sessions are closed, this one stays.
  const calls = [];
  const client = { signOut: async (options) => { calls.push(options); return { error: null }; } };
  const result = await signOutOtherDevicesIfAsked(true, client);
  assert.deepEqual(result, { warningKey: null });
  assert.deepEqual(calls, [{ scope: "others" }]);
}
{
  // Box ticked but signing the others out fails: the password is already
  // saved, so it is still a success, with a gentle warning.
  const client = { signOut: async () => ({ error: { message: "Failed to fetch" } }) };
  assert.deepEqual(await signOutOtherDevicesIfAsked(true, client), {
    warningKey: "resetPassword.otherDevicesFailed",
  });
  const throwing = { signOut: async () => { throw new Error("offline"); } };
  assert.deepEqual(await signOutOtherDevicesIfAsked(true, throwing), {
    warningKey: "resetPassword.otherDevicesFailed",
  }, "a thrown error is treated the same way, never as a failed password change");
}

console.log("passwordReset: all checks passed");
