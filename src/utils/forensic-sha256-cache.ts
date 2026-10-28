/**
 * ==========================================================================
 * PERMANENT SHA-256 FORENSIC CACHE ENGINE (SSOT)
 * Memory + LocalStorage Dual-Tier Caching for 0ms Zero-Latency Retrieval
 * ==========================================================================
 */

import type { SlipExtraction } from "@/schemas/slip.schema";
import { EXTRACTION_VERSION } from "./extraction-version.mjs";
import { sha256Hex } from "./sha256-browser.mjs";

const CACHE_STORAGE_KEY = "digital_evidence_sha256_cache_v1";

// In-Memory Fast Tier
const memoryCache = new Map<string, { extractionVersion: number; data: SlipExtraction }>();

export function parseCachedSlipEntry(stored: string): { extractionVersion: number; data: SlipExtraction } | null {
  try {
    const parsed = JSON.parse(stored) as { extractionVersion?: unknown; data?: SlipExtraction };
    if (parsed.extractionVersion !== EXTRACTION_VERSION || !parsed.data) return null;
    return { extractionVersion: EXTRACTION_VERSION, data: parsed.data };
  } catch {
    return null;
  }
}

export function serializeCachedSlipEntry(data: SlipExtraction): string {
  return JSON.stringify({ extractionVersion: EXTRACTION_VERSION, data });
}

/**
 * Compute SHA-256 Hash of an ArrayBuffer in browser native crypto
 */
export async function computeFileSha256(file: File): Promise<string> {
  try {
    const buffer = typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error("อ่านไฟล์เพื่อคำนวณ SHA-256 ไม่สำเร็จ"));
        reader.readAsArrayBuffer(file);
      });
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      try {
        const digestBuffer = await subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(digestBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch (error) {
        console.warn("[SHA-256] Web Crypto digest failed; using deterministic fallback", error);
      }
    }
    return sha256Hex(new Uint8Array(buffer));
  } catch (error) {
    console.error(`[SHA-256] file hashing failed name=${file?.name} size=${file?.size} type=${file?.type} hasArrayBuffer=${typeof file?.arrayBuffer === "function"} error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    throw error;
  }
}

/**
 * Get cached extraction result by SHA-256 hash (0ms retrieval)
 */
export function getCachedSlip(sha256: string): SlipExtraction | null {
  if (!sha256) return null;

  // 1. Check memory cache
  const memoryEntry = memoryCache.get(sha256);
  if (memoryEntry?.extractionVersion === EXTRACTION_VERSION) {
    return memoryEntry.data;
  }
  if (memoryEntry) {
    memoryCache.delete(sha256);
  }

  // 2. Check localStorage cache
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(`${CACHE_STORAGE_KEY}_${sha256}`);
      if (stored) {
        const parsed = parseCachedSlipEntry(stored);
        if (!parsed) return null;
        memoryCache.set(sha256, parsed);
        return parsed.data;
      }
    } catch {
      // Ignore storage errors
    }
  }

  return null;
}

/**
 * Store extraction result associated with SHA-256 hash
 */
export function setCachedSlip(sha256: string, data: SlipExtraction): void {
  if (!sha256 || !data) return;

  // Store in memory
  const entry = { extractionVersion: EXTRACTION_VERSION, data };
  memoryCache.set(sha256, entry);

  // Store in localStorage
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${CACHE_STORAGE_KEY}_${sha256}`, serializeCachedSlipEntry(data));
    } catch {
      // Ignore quota exceeded
    }
  }
}

/**
 * Clear ALL cached slip extractions (memory + localStorage)
 * ใช้เมื่อต้องการประมวลผลไฟล์เดิมใหม่ด้วย OCR เวอร์ชันใหม่
 */
export function clearAllSlipCache(): number {
  let count = 0;

  // Clear memory cache
  count += memoryCache.size;
  memoryCache.clear();

  // Clear localStorage cache
  if (typeof window !== "undefined") {
    try {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith(CACHE_STORAGE_KEY)
      );
      keys.forEach((k) => localStorage.removeItem(k));
      count = Math.max(count, keys.length);
    } catch {
      // Ignore
    }
  }

  return count;
}

