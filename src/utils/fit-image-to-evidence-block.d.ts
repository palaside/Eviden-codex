export type EvidenceBlock = { x: number; y: number; width: number; height: number };
export type ImageFit = { x: number; y: number; width: number; height: number; scale: number };
export function fitImageToEvidenceBlock(imageWidth: number, imageHeight: number, block: EvidenceBlock): ImageFit;
