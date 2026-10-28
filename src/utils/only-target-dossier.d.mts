export type TargetDossierDirection = "IN" | "OUT" | "BOTH";

export function selectTargetDossierRecords<T extends {
  id: string;
  data?: {
    sender?: { name?: string | null };
    receiver?: { name?: string | null };
    transaction?: { date?: string | null; time?: string | null };
  };
}>(records: readonly T[], targetName: string): Array<T & {
  record: T;
  direction: TargetDossierDirection;
  sortTimestamp: number | null;
  inputIndex: number;
}>;
