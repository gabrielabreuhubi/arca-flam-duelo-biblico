export function firstName(fullName = "") {
  return fullName.trim().split(/\s+/)[0] || "";
}

export function publicParticipantName(fullName = "") {
  return firstName(fullName);
}

export function operatorParticipantName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts.at(-1).slice(0, 1)}.`;
}

export function isDuelReadyToFinish(duel, totalRounds = 3, pointsToWin = 2) {
  if (duel.score_a >= pointsToWin || duel.score_b >= pointsToWin) return true;
  if (duel.score_a === duel.score_b) return false;
  return duel.current_round > totalRounds;
}

export function winnerIdForDuel(duel) {
  if (duel.score_a > duel.score_b) return duel.participant_a_id;
  if (duel.score_b > duel.score_a) return duel.participant_b_id;
  return null;
}
