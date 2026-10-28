export interface PixelPageOccurrence {
  id: string;
  sourceItemId: string;
  fileName: string;
  pageNumber: number;
  width: number;
  height: number;
  readPixels: () => Promise<Uint8Array | Uint8ClampedArray | null>;
}

export function findPixelIdenticalPageGroups(pages: PixelPageOccurrence[]): Promise<PixelPageOccurrence[][]>;
export function buildPixelDuplicateWarnings(groups: PixelPageOccurrence[][]): Array<{ sourceItemId: string; warning: string }>;
export function buildUniquePixelJobPlan<T>(
  jobs: T[],
  groups: PixelPageOccurrence[][],
  getJobId: (job: T, index: number) => string,
): { jobs: T[]; resultIndexes: number[] };
export function expandUniquePixelJobResults<TJob, TResult>(
  jobs: TJob[],
  plan: { jobs: TJob[]; resultIndexes: number[] },
  results: TResult[],
): TResult[];
