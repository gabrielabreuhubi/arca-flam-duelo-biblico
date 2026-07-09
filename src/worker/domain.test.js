import test from "node:test";
import assert from "node:assert/strict";
import {
  firstName,
  isDuelReadyToFinish,
  publicParticipantName,
  winnerIdForDuel
} from "./domain.js";

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

test("round limit does not end a tied duel (sudden death)", () => {
  const tied = { score_a: 1, score_b: 1, current_round: 4 };
  assert.equal(isDuelReadyToFinish(tied), false);
  assert.equal(isDuelReadyToFinish({ ...tied, current_round: 10 }), false);
  assert.equal(isDuelReadyToFinish({ ...tied, score_a: 2 }), true);
});
