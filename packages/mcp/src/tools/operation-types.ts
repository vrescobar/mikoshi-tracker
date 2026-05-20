export type ToolJsonResult = {
  payload: unknown;
  summary: string;
};

/** Result of a tool that returns binary image data instead of JSON. */
export type ToolImageResult = {
  image: {
    /** Base64-encoded image bytes. */
    base64: string;
    mimeType: string;
  };
  summary: string;
  /** JSON metadata returned alongside the image (e.g. the attachment id). */
  metadata: Record<string, unknown>;
};

export type ToolOperationResult = ToolJsonResult | ToolImageResult;

export type ToolOperation = (input: unknown) => Promise<ToolOperationResult>;

export function isImageResult(result: ToolOperationResult): result is ToolImageResult {
  return "image" in result;
}
