export type OperationCell = {
  id: string;
  source: string;
  method?: string;
  args?: Record<string, string>;
  variants?: Record<string, string>;
  waitMs?: number;
};

export type OperationCellRun = {
  status: "running" | "error" | "done";
  output: string | null;
  progress?: string;
  startedAt?: number;
  elapsedSeconds?: number;
  callsStarted?: number;
  callsCompleted?: number;
};
