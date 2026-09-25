export interface FrameSize {
  width: number
  height: number
}

export const analysisMaximumShorterSide = 720

export function liveAnalysisSize(videoSize: FrameSize): FrameSize {
  const ratio = Math.min(1, analysisMaximumShorterSide / Math.min(videoSize.width, videoSize.height))
  return { width: Math.round(videoSize.width * ratio), height: Math.round(videoSize.height * ratio) }
}
