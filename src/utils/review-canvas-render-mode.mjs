/**
 * The original chat review must use the persisted slices. Full-image rendering
 * is reserved for selected derived/overlay artifacts and standalone slips.
 */
export function shouldRenderChatSlices({ isChatMode, sourceKind }) {
  return isChatMode && sourceKind === "original";
}
