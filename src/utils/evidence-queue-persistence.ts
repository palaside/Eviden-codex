import { EXTRACTION_VERSION } from "./extraction-version.mjs";

export { EXTRACTION_VERSION };

const DATABASE_NAME = "digital-evidence-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const SNAPSHOT_KEY = "processed-evidence-queue";
type QueueItem = { file: File; previewUrl: string };

export async function encodeEvidenceQueueFiles(snapshot: unknown): Promise<unknown> {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const value = snapshot as { stagedQueue?: Array<Record<string, unknown>> };
  if (!Array.isArray(value.stagedQueue)) return snapshot;

  return {
    ...value,
    stagedQueue: await Promise.all(value.stagedQueue.map(async (item) => {
      const file = item.file;
      if (!(file instanceof Blob)) return item;
      const storedItem = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "file"));
      return {
        ...storedItem,
        fileBytes: await file.arrayBuffer(),
        fileName: file instanceof File ? file.name : "evidence",
        fileType: file.type,
        fileLastModified: file instanceof File ? file.lastModified : Date.now(),
      };
    })),
  };
}

async function decodeEvidenceQueueFiles(snapshot: unknown): Promise<unknown> {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const value = snapshot as { stagedQueue?: Array<Record<string, unknown>> };
  if (!Array.isArray(value.stagedQueue)) return snapshot;

  return {
    ...value,
    stagedQueue: value.stagedQueue.map((item) => {
      if (!(item.fileBytes instanceof ArrayBuffer)) return item;
      const { fileBytes, fileName, fileType, fileLastModified, ...storedItem } = item;
      return {
        ...storedItem,
        file: new File([fileBytes], typeof fileName === "string" ? fileName : "evidence", {
          type: typeof fileType === "string" ? fileType : "",
          lastModified: typeof fileLastModified === "number" ? fileLastModified : 0,
        }),
      };
    }),
  };
}

export function serializeEvidenceQueueSnapshot<T extends QueueItem>(
  stagedQueue: T[],
  manifestList: unknown[],
) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    manifestList,
    stagedQueue: stagedQueue.map((item) => {
      const { previewUrl, ...storedItem } = item;
      void previewUrl;
      return { ...storedItem, file: item.file };
    }),
  };
}

export async function restoreEvidenceQueueSnapshot<T extends QueueItem>(
  snapshot: unknown,
  createObjectUrl: (file: File) => string = (file) => URL.createObjectURL(file),
) {
  snapshot = await decodeEvidenceQueueFiles(snapshot);
  if (!snapshot || typeof snapshot !== "object") return null;
  const stored = snapshot as {
    version?: unknown;
    stagedQueue?: Array<Omit<T, "previewUrl">>;
    manifestList?: unknown[];
  };
  if (stored.version !== 1 || !Array.isArray(stored.stagedQueue)) return null;
  let stalePendingCount = 0;
  const stagedQueue = stored.stagedQueue.map((item) => {
    const record = item as T & {
      category?: string;
      status?: string;
      isConfirmed?: boolean;
      extractionVersion?: number;
      embeddedSlips?: Array<{ isConfirmed?: boolean; extractionVersion?: number }>;
      [key: string]: unknown;
    };
    let restoredItem: Record<string, unknown> = {
      ...item,
      status: record.status === "processing" ? "staged" : record.status,
    };

    const isStaleItem = record.extractionVersion !== EXTRACTION_VERSION;
    const isProcessedItem = record.status === "done" && record.category !== "PENDING";
    if (isProcessedItem && (isStaleItem || record.category === "CHAT")) {
      const embeddedSlips = record.embeddedSlips || [];
      const confirmedSlips = embeddedSlips.filter((slip) => slip.isConfirmed);
      const freshPendingSlips = embeddedSlips.filter((slip) => !slip.isConfirmed && slip.extractionVersion === EXTRACTION_VERSION);
      const stalePendingSlips = embeddedSlips.filter((slip) => !slip.isConfirmed && slip.extractionVersion !== EXTRACTION_VERSION);
      const hasStaleDerivedData = isStaleItem && (
        record.data !== undefined || record.chatEvidenceLayers !== undefined || embeddedSlips.length === 0
      );
      const shouldInvalidate = (isStaleItem || stalePendingSlips.length > 0)
        && !(record.category !== "CHAT" && record.isConfirmed);

      if (shouldInvalidate) {
        stalePendingCount += stalePendingSlips.length || (hasStaleDerivedData && !record.isConfirmed && confirmedSlips.length === 0 && freshPendingSlips.length === 0 ? 1 : 0);
        const retainedSlips = [...confirmedSlips, ...freshPendingSlips];
        const canKeepProcessedItem = record.isConfirmed || confirmedSlips.length > 0 || freshPendingSlips.length > 0;
        restoredItem = {
          ...restoredItem,
          ...(canKeepProcessedItem ? {} : { status: "staged" }),
          ...(isStaleItem ? { data: undefined, chatEvidenceLayers: undefined, ocrTextBoxes: undefined } : {}),
          embeddedSlips: retainedSlips.length > 0 ? retainedSlips : undefined,
          ...(!canKeepProcessedItem ? {
            sourceBounds: undefined,
            chatSlices: undefined,
            chatStreamPageNumbers: undefined,
            chatSourceSegments: undefined,
            stitchingWarnings: undefined,
            isDuplicate: false,
            duplicateOfRef: undefined,
          } : {}),
          ...(isStaleItem ? {
            chatSlices: undefined,
            chatStreamPageNumbers: undefined,
            chatSourceSegments: undefined,
            stitchingWarnings: undefined,
          } : {}),
        };
      }
    }

    return {
      ...restoredItem,
      previewUrl: createObjectUrl(item.file),
    };
  }) as unknown as T[];
  return { stagedQueue, manifestList: stored.manifestList || [], stalePendingCount };
}

function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("เบราว์เซอร์นี้ไม่รองรับ IndexedDB"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("เปิดที่เก็บข้อมูลในเครื่องไม่สำเร็จ"));
  });
}

export async function saveEvidenceQueueSnapshot(snapshot: unknown): Promise<void> {
  const encodedSnapshot = await encodeEvidenceQueueFiles(snapshot);
  const database = await openWorkspaceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(encodedSnapshot, SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("บันทึกผลสกัดในเครื่องไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error || new Error("การบันทึกผลสกัดถูกยกเลิก"));
    });
  } finally {
    database.close();
  }
}

export async function loadEvidenceQueueSnapshot(): Promise<unknown | null> {
  const database = await openWorkspaceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error("อ่านผลสกัดจากเครื่องไม่สำเร็จ"));
    });
  } finally {
    database.close();
  }
}

export async function clearEvidenceQueueSnapshot(): Promise<void> {
  const database = await openWorkspaceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("ลบผลสกัดจากเครื่องไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error || new Error("การลบข้อมูลในเครื่องถูกยกเลิก"));
    });
  } finally {
    database.close();
  }
}
