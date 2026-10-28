import type { ChatStreamSourceSegment } from "@/utils/stitch-chat-images";

export interface StreamBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function mapStreamBoundsToSources(bounds: StreamBounds, segments: ChatStreamSourceSegment[]) {
  const intersections = segments.flatMap((segment) => {
    const left = Math.max(bounds.x, 0);
    const right = Math.min(bounds.x + bounds.width, 807);
    const top = Math.max(bounds.y, segment.streamStartY);
    const bottom = Math.min(bounds.y + bounds.height, segment.streamEndY);
    if (right <= left || bottom <= top) return [];
    const scale = segment.sourceScale;
    return [{
      sourceItemId: segment.sourceItemId,
      sourceFileName: segment.sourceFileName,
      sourceSha256: segment.sourceSha256,
      ...(segment.captureTime !== undefined ? { captureTime: segment.captureTime } : {}),
      ...(segment.eventTime !== undefined ? { eventTime: segment.eventTime } : {}),
      ...(segment.sourceTrim ? { sourceTrim: segment.sourceTrim } : {}),
      intersectionArea: (right - left) * (bottom - top),
      sourceBounds: {
        x: left * scale,
        y: (segment.sourceOffsetY + top - segment.streamStartY) * scale,
        width: (right - left) * scale,
        height: (bottom - top) * scale,
      },
    }];
  }).sort((left, right) => right.intersectionArea - left.intersectionArea);

  return {
    primary: intersections[0] || null,
    sources: intersections.map(({ intersectionArea, ...source }) => {
      void intersectionArea;
      return source;
    }),
    crossesSourceBoundary: intersections.length > 1,
  };
}
