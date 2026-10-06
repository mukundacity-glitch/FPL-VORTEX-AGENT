import type { FplDataSnapshot } from "./types.js";

export interface FplDataValidation { errors: string[]; warnings: string[]; }
function duplicates(values: readonly number[]): number[] {
  const seen = new Set<number>(); const dup = new Set<number>();
  for (const value of values) { if (seen.has(value)) dup.add(value); else seen.add(value); }
  return [...dup];
}

export class FplDataValidator {
  public validate(snapshot: FplDataSnapshot): FplDataValidation {
    const errors: string[] = []; const warnings: string[] = [];
    const playerDuplicates = duplicates(snapshot.players.map((p) => p.id));
    const teamDuplicates = duplicates(snapshot.teams.map((t) => t.id));
    const fixtureDuplicates = duplicates(snapshot.fixtures.map((f) => f.id));
    if (playerDuplicates.length) errors.push(`Duplicate player IDs: ${playerDuplicates.join(", ")}`);
    if (teamDuplicates.length) errors.push(`Duplicate team IDs: ${teamDuplicates.join(", ")}`);
    if (fixtureDuplicates.length) errors.push(`Duplicate fixture IDs: ${fixtureDuplicates.join(", ")}`);
    const teamIds = new Set(snapshot.teams.map((t) => t.id));
    for (const player of snapshot.players) {
      if (!teamIds.has(player.teamId)) errors.push(`Player ${player.id} references unknown team ${player.teamId}.`);
      if (player.price <= 0) warnings.push(`Player ${player.id} has non-positive price.`);
      if (player.position < 1 || player.position > 4) errors.push(`Player ${player.id} has invalid position.`);
    }
    for (const fixture of snapshot.fixtures) {
      if (!teamIds.has(fixture.teamHome) || !teamIds.has(fixture.teamAway)) errors.push(`Fixture ${fixture.id} references an unknown team.`);
      if (fixture.teamHome === fixture.teamAway) errors.push(`Fixture ${fixture.id} has the same home and away team.`);
      if (fixture.difficultyHome < 1 || fixture.difficultyHome > 5 || fixture.difficultyAway < 1 || fixture.difficultyAway > 5) warnings.push(`Fixture ${fixture.id} has FDR outside 1-5.`);
    }
    if (!snapshot.gameweeks.some((gw) => gw.isNext || (gw.isCurrent && !gw.finished))) warnings.push("No active/upcoming Gameweek is marked in the snapshot.");
    return { errors, warnings };
  }

  public assertValid(snapshot: FplDataSnapshot): string[] {
    const result = this.validate(snapshot);
    if (result.errors.length) throw new Error(`Invalid FPL data snapshot: ${result.errors.join(" ")}`);
    return result.warnings;
  }
}
