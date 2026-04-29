/** 单步用户操作记录，用于回放和脚本生成。 */
export type ActionRecordItem = {
  timestamp: number;
  type: "click" | "input" | "wait" | "navigate";
  selector?: string;
  value?: string;
  delay: number;
};

/** 用户操作录制器端口。支持录制、回放、YAML 导入导出。 */
export interface IActionRecorder {
  /** 开始录制用户操作。 */
  start(): void;
  /** 停止录制并返回已记录的操作列表。 */
  stop(): ActionRecordItem[];
  /** 将操作列表保存为 YAML 文件。 */
  saveToYaml(path: string, actions: ActionRecordItem[]): Promise<void>;
  /** 从 YAML 文件加载操作列表。 */
  loadFromYaml(path: string): Promise<ActionRecordItem[]>;
}
