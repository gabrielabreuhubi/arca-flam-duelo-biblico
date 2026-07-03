import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveLevel,
  firstName,
  isDuelReadyToFinish,
  publicParticipantName,
  winnerIdForDuel
} from "./domain.js";

test("effectiveLevel uses the lower level for crossed duels", () => {
  assert.equal(effectiveLevel("basic", "expert"), "basic");
  assert.equal(effectiveLevel("intermediate", "expert"), "intermediate");
  assert.equal(effectiveLevel("expert", "expert"), "expert");
});

test("public participant names expose only first name", () => {
  assert.equal(publicParticipantName("Mariana Costa Silva"), "Mariana");
  assert.equal(firstName(" Rafael M. "), "Rafael");
});

test("duel finish and winner rules", () => {
  const duel = {
    participant_a_id: "a",
    participant_b_id: "b",
    score_a: 2,
    score_b: 1,
    current_round: 3
  };
  assert.equal(isDuelReadyToFinish(duel), true);
  assert.equal(winnerIdForDuel(duel), "a");
  assert.equal(winnerIdForDuel({ ...duel, score_a: 1, score_b: 1 }), null);
});
