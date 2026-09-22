import { describe, expect, it } from "vitest";
import { friendlyJoinError } from "./join-errors";

describe("friendlyJoinError", () => {
  it("translates every error join_session can raise", () => {
    expect(friendlyJoinError("invalid join code")).toMatch(/No game has that code/);
    expect(friendlyJoinError("this session has finished")).toMatch(/already ended/);
    expect(friendlyJoinError("late join is not allowed for this session")).toMatch(/already started/);
    expect(friendlyJoinError("this session is full")).toMatch(/full/);
    expect(friendlyJoinError("the host removed you from this session")).toMatch(/removed you/);
  });

  it("covers the network and rate-limit failures supabase-js reports", () => {
    expect(friendlyJoinError("TypeError: Failed to fetch")).toMatch(/connection/);
    expect(friendlyJoinError("Request rate limit reached")).toMatch(/Wait a moment/);
  });

  it("never passes a raw database message through", () => {
    const out = friendlyJoinError('duplicate key value violates unique constraint "players_pkey"');
    expect(out).toBe("Couldn't join that game. Check the code and try again.");
  });
});
