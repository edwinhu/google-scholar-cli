/**
 * Binary frame parser for Google Scholar Labs Search API responses.
 *
 * The API returns application/octet-stream with binary-framed JSON:
 *   [4-byte big-endian uint32 length][N-byte UTF-8 JSON payload]
 * Multiple frames are concatenated in the response body.
 */

/**
 * Parse binary-framed response into JSON messages.
 * Format: [4-byte BE uint32 length][N-byte JSON payload] repeated.
 */
export function parseBinaryFrames(buffer: ArrayBuffer): unknown[] {
  const view = new DataView(buffer);
  const messages: unknown[] = [];
  let offset = 0;

  while (offset + 4 <= view.byteLength) {
    const length = view.getUint32(offset, false); // big-endian
    offset += 4;

    if (offset + length > view.byteLength) break; // truncated payload

    const jsonBytes = new Uint8Array(buffer, offset, length);
    const text = new TextDecoder().decode(jsonBytes);
    messages.push(JSON.parse(text));
    offset += length;
  }

  return messages;
}

/**
 * Create a streaming frame parser for incremental parsing of chunked responses.
 * Buffers incomplete frames across push() calls.
 */
export function createFrameParser(): {
  push(chunk: Uint8Array): unknown[];
  flush(): unknown[];
} {
  let buffer = new Uint8Array(0);

  return {
    push(chunk: Uint8Array): unknown[] {
      // Append chunk to internal buffer
      const newBuf = new Uint8Array(buffer.length + chunk.length);
      newBuf.set(buffer);
      newBuf.set(chunk, buffer.length);
      buffer = newBuf;

      // Extract all complete frames
      const messages: unknown[] = [];
      let offset = 0;

      while (offset + 4 <= buffer.length) {
        const view = new DataView(
          buffer.buffer,
          buffer.byteOffset + offset,
          4,
        );
        const length = view.getUint32(0, false);

        if (offset + 4 + length > buffer.length) break; // incomplete frame

        const text = new TextDecoder().decode(
          buffer.slice(offset + 4, offset + 4 + length),
        );
        messages.push(JSON.parse(text));
        offset += 4 + length;
      }

      // Retain unconsumed bytes
      buffer = buffer.slice(offset);
      return messages;
    },

    flush(): unknown[] {
      buffer = new Uint8Array(0);
      return [];
    },
  };
}
