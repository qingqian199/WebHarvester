export type ActionRecordItem = {
  timestamp: number;
  type: "click" | "input" | "wait" | "navigate";
  selector?: string;
  value?: string;
  delay: number;
};

export interface IActionRecorder {
  start(): void;
  stop(): ActionRecordItem[];
  saveToYaml(path: string, actions: ActionRecordItem[]): Promise<void>;
  loadFromYaml(path: string): Promise<ActionRecordItem[]>;
}