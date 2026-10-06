import type { BacktestResult } from "./types.js";

export interface BacktestObservation { projected: number; actual: number; }

export class ProjectionBacktester {
  public evaluate(observations: readonly BacktestObservation[]): BacktestResult {
    if (observations.length === 0) return { observations: 0, mae: 0, rmse: 0, bias: 0 };
    let absolute = 0; let squared = 0; let bias = 0;
    for (const item of observations) { const error = item.projected - item.actual; absolute += Math.abs(error); squared += error * error; bias += error; }
    return { observations: observations.length, mae: absolute / observations.length, rmse: Math.sqrt(squared / observations.length), bias: bias / observations.length };
  }
}
