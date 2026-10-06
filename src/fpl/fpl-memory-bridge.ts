import type { VortexMemory } from "../memory/vortex-memory.js";
import type { FplAnalysisReport } from "./types.js";

export interface FplMemoryCoordinates { tenantId: string; namespace: string; projectId: string; }

export class FplReportMemoryBridge {
  public constructor(private readonly memory: VortexMemory) {}

  public async remember(report: FplAnalysisReport, coordinates: FplMemoryCoordinates): Promise<string> {
    const captain = report.captainCandidates[0];
    const transfer = report.transferPlans[0];
    const chip = report.chipPlan.recommended;
    const content = [
      `FPL Vortex analysis for GW${report.currentGameweek}; horizon ${report.horizon.join(",")}.`,
      captain ? `Captain recommendation: player ${captain.playerId}, score ${captain.captainScore.toFixed(2)}, xP ${captain.expectedPoints.toFixed(2)}.` : "No captain recommendation.",
      transfer ? `Top transfer plan: ${transfer.moves.map((move) => `${move.outPlayerId}->${move.inPlayerId}`).join(", ")}; risk-adjusted gain ${transfer.riskAdjustedGain.toFixed(2)}.` : "No positive transfer plan identified.",
      chip ? `Top chip candidate: ${chip.chip} in GW${chip.gameweek}, expected gain ${chip.expectedGain.toFixed(2)}.` : "No chip candidate.",
      report.warnings.length ? `Warnings: ${report.warnings.join(" | ")}` : "Warnings: none.",
    ].join("\n");
    const record = await this.memory.remember({
      tenantId: coordinates.tenantId,
      namespace: coordinates.namespace,
      scope: "project",
      projectId: coordinates.projectId,
      content,
      tags: ["fpl", "analysis", `gw-${report.currentGameweek}`],
      importance: 0.72,
      source: "FPL Vortex Intelligence",
      metadata: { generatedAt: report.generatedAt, gameweek: report.currentGameweek, horizon: report.horizon },
    });
    return record.id;
  }
}
