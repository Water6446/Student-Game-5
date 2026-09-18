import { describe, expect, it } from "vitest";
import {
  AUTH_FAILURE_COPY,
  authFailure,
  emailSendErrorMessage,
  linkErrorMessage,
  parseAuthFailure,
  signInErrorMessage,
  signUpErrorMessage,
} from "./errors";

const WRONG = "Wrong email or password";

describe("signInErrorMessage", () => {
  it("keeps bad credentials generic, so it is not an account oracle", () => {
    expect(signInErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials", status: 400 }, WRONG)).toBe(WRONG);
    expect(signInErrorMessage({ message: "anything else", status: 400 }, WRONG)).toBe(WRONG);
  });

  it("names an unconfirmed email — only reachable with the right password", () => {
    expect(signInErrorMessage({ message: "Email not confirmed", code: "email_not_confirmed", status: 400 }, WRONG)).toMatch(/confirm your email/i);
  });

  it("does not blame the password for a rate limit or an outage", () => {
    expect(signInErrorMessage({ message: "Request rate limit reached", status: 429 }, WRONG)).toMatch(/too many attempts/i);
    expect(signInErrorMessage({ message: "x", code: "over_request_rate_limit" }, WRONG)).toMatch(/too many attempts/i);
    expect(signInErrorMessage({ message: "Failed to fetch", status: 0 }, WRONG)).toMatch(/not responding/i);
    expect(signInErrorMessage({ message: "upstream", status: 502 }, WRONG)).toMatch(/not responding/i);
  });
});

describe("emailSendErrorMessage", () => {
  it("hides 'no such user' behind the same success as a real send", () => {
    expect(emailSendErrorMessage({ message: "Signups not allowed for otp", code: "otp_disabled", status: 422 })).toBeNull();
    expect(emailSendErrorMessage({ message: "User not found", status: 400 })).toBeNull();
  });

  it("shows failures that say nothing about the address", () => {
    expect(emailSendErrorMessage({ message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 })).toMatch(/too many/i);
    expect(emailSendErrorMessage({ message: "boom", status: 500 })).toMatch(/could not send/i);
  });
});

describe("linkErrorMessage", () => {
  it("explains the dashboard toggle being off instead of echoing Supabase's jargon", () => {
    const msg = linkErrorMessage({ message: "Manual linking is disabled", code: "manual_linking_disabled", status: 404 });
    expect(msg).toMatch(/isn't switched on/i);
    expect(msg).not.toMatch(/manual linking/i);
  });

  it("passes anything else through", () => {
    expect(linkErrorMessage({ message: "Something else", status: 400 })).toBe("Something else");
  });
});

describe("signUpErrorMessage", () => {
  it("turns the trigger's generic 500 into the cause a person can fix", () => {
    expect(signUpErrorMessage({ message: "Database error saving new user", code: "unexpected_failure", status: 500 })).toMatch(/username/i);
  });

  it("says an email is taken plainly", () => {
    expect(signUpErrorMessage({ message: "User already registered", code: "user_already_exists", status: 422 })).toMatch(/already has an account/i);
    expect(signUpErrorMessage({ message: "A user with this email address has already been registered", code: "email_exists", status: 422 })).toMatch(/already has an account/i);
  });

  it("passes other validation messages (e.g. password policy) through", () => {
    expect(signUpErrorMessage({ message: "Password should contain at least one digit", code: "weak_password", status: 422 })).toBe("Password should contain at least one digit");
  });
});

describe("authFailure / parseAuthFailure", () => {
  it("maps GoTrue codes to the reasons /auth/error explains", () => {
    expect(authFailure("otp_expired")).toBe("expired");
    expect(authFailure("flow_state_not_found")).toBe("expired");
    expect(authFailure("pkce_code_verifier_not_found")).toBe("other-browser");
    expect(authFailure("access_denied")).toBe("cancelled");
    expect(authFailure("identity_already_exists")).toBe("already-linked");
    expect(authFailure("email_exists")).toBe("email-taken");
    expect(authFailure("manual_linking_disabled")).toBe("linking-off");
    expect(authFailure(null)).toBe("unknown");
    expect(authFailure("something_new")).toBe("unknown");
  });

  it("never lets a hand-crafted reason pick arbitrary copy", () => {
    expect(parseAuthFailure("expired")).toBe("expired");
    expect(parseAuthFailure("<script>")).toBe("unknown");
    expect(parseAuthFailure("constructor")).toBe("unknown");
    expect(parseAuthFailure(["cancelled", "expired"])).toBe("cancelled");
    expect(parseAuthFailure(undefined)).toBe("unknown");
  });

  it("has copy for every reason", () => {
    for (const code of ["otp_expired", "bad_code_verifier", "access_denied", "identity_already_exists", "email_exists", "manual_linking_disabled", null]) {
      expect(AUTH_FAILURE_COPY[authFailure(code)].title.length).toBeGreaterThan(0);
    }
  });
});
