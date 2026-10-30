export type ServerActionGuardFinding = {
  file: string;
  action: string;
  line: number;
  rule: 'authorization-before-database' | 'schema-before-mutation';
  detail: string;
};

export function analyzeActionSource(
  sourceText: string,
  filePath: string,
  options?: { actionNames?: Set<string> },
): ServerActionGuardFinding[];

export function analyzeNewOrChangedActionSource(
  sourceText: string,
  baselineText: string | undefined,
  filePath: string,
): ServerActionGuardFinding[];

export function scanRepository(
  root?: string,
  baseRef?: string,
): {
  findings: ServerActionGuardFinding[];
  files: number;
  totalActions: number;
  checkedActions: number;
  baseRef: string;
};
