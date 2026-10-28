const RENDER_WIDTH = 807;

function isFiniteBounds(bounds) {
  return [bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0;
}

function mapSourceBoundsToStream(bounds, sourceWidth, segment) {
  const sourceScaleX = sourceWidth / RENDER_WIDTH;
  return {
    x: bounds.x / sourceScaleX,
    y: segment.streamStartY + (bounds.y - segment.sourceOffsetY) / segment.sourceScale,
    width: bounds.width / sourceScaleX,
    height: bounds.height / segment.sourceScale,
  };
}

function mapStreamBoundsToSlice(bounds, slice) {
  const contentScaleX = slice.contentScaleX || 1;
  const contentScaleY = slice.contentScaleY || 1;
  return {
    x: bounds.x / contentScaleX + (slice.contentOffsetX || 0),
    y: (bounds.y - slice.startY) / contentScaleY,
    width: bounds.width / contentScaleX,
    height: bounds.height / contentScaleY,
  };
}

/** Map a source-image OCR/QR candidate to the chat slice containing its center. */
export function mapSourceSlipCandidateToChatSlice(candidate, { sourceWidth, sourceItemId, sourceSegments, slices }) {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !isFiniteBounds(candidate?.bounds)) return null;
  const centerY = candidate.bounds.y + candidate.bounds.height / 2;
  const segment = sourceSegments.find((entry) => {
    if (entry.sourceItemId !== sourceItemId || !Number.isFinite(entry.sourceScale) || entry.sourceScale <= 0) return false;
    const sourceEndY = entry.sourceOffsetY + (entry.streamEndY - entry.streamStartY) * entry.sourceScale;
    return centerY >= entry.sourceOffsetY && centerY <= sourceEndY;
  });
  if (!segment) return null;

  const streamBounds = mapSourceBoundsToStream(candidate.bounds, sourceWidth, segment);
  const streamCenterY = streamBounds.y + streamBounds.height / 2;
  const sliceIndex = slices.findIndex((slice, index) => streamCenterY >= slice.startY
    && (streamCenterY < slice.endY || index === slices.length - 1 && streamCenterY <= slice.endY));
  if (sliceIndex < 0) return null;
  const slice = slices[sliceIndex];
  const mappedCandidate = {
    ...candidate,
    bounds: mapStreamBoundsToSlice(streamBounds, slice),
    ...(Array.isArray(candidate.ocrTextBoxes) ? {
      ocrTextBoxes: candidate.ocrTextBoxes.flatMap((box) => isFiniteBounds(box?.bounds)
        ? [{ ...box, bounds: mapStreamBoundsToSlice(mapSourceBoundsToStream(box.bounds, sourceWidth, segment), slice) }]
        : []),
    } : {}),
  };

  return { sliceIndex, streamPageNumber: slice.streamPageNumber || slice.sliceIndex, candidate: mappedCandidate };
}
