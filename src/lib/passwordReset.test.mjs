import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  buildPasswordResetRedirect,
  hasAuthLinkError,
  isRecoveryCallback,
  nextRecoveryFlag,
  recoveryRedirect,
  resetRequestErrorKey,
  updatePasswordErrorKey,
  validateNewPassword,
  validateResetEmail,
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
// Anything that is not a network or rate-limit problem shows the same
// "if there is an account, we sent a link" message (null = that message).
assert.equal(resetRequestErrorKey(null), null);
assert.equal(resetRequestErrorKey({ message: "User not found", status: 400 }), null);
assert.equal(
  resetRequestErrorKey({ message: "Unable to validate email address: invalid format", status: 400 }),
  null,
);
assert.equal(resetRequestErrorKey({ message: "Database error finding user", status: 500 }), null);
assert.equal(
  resetRequestErrorKey({ message: "email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" }),
  "auth.error.rateLimit",
);
assert.equal(
  resetRequestErrorKey({ message: "For security purposes, you can only request this after 42 seconds.", status: 429 }),
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

// --- Remembering that the session came from a recovery link ---------------
assert.equal(nextRecoveryFlag(false, "PASSWORD_RECOVERY"), true);
assert.equal(nextRecoveryFlag(true, "USER_UPDATED"), false, "the password was changed");
assert.equal(nextRecoveryFlag(true, "SIGNED_OUT"), false);
assert.equal(nextRecoveryFlag(true, "TOKEN_REFRESHED"), true, "a token refresh does not end recovery");
assert.equal(nextRecoveryFlag(true, "INITIAL_SESSION"), true);
assert.equal(nextRecoveryFlag(false, "SIGNED_IN"), false);

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

console.log("passwordReset: all checks passed");
