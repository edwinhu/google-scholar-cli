import { describe, expect, it } from "bun:test";
import { parseBinaryFrames, createFrameParser } from "../src/util/parser";

/** Build a binary frame: 4-byte BE uint32 length prefix + JSON payload. */
function makeFrame(obj: unknown): Uint8Array {
  const json = JSON.stringify(obj);
  const payload = new TextEncoder().encode(json);
  const frame = new Uint8Array(4 + payload.length);
  const view = new DataView(frame.buffer);
  view.setUint32(0, payload.length, false); // big-endian
  frame.set(payload, 4);
  return frame;
}

/** Concatenate multiple Uint8Arrays into one. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

describe("parseBinaryFrames", () => {
  it("parses a single frame", () => {
    const original = { hello: "world", count: 42 };
    const frame = makeFrame(original);
    const messages = parseBinaryFrames(frame.buffer);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(original);
  });

  it("parses multiple frames", () => {
    const msg1 = { id: 1, text: "first" };
    const msg2 = { id: 2, text: "second" };
    const msg3 = { id: 3, text: "third" };

    const combined = concat(makeFrame(msg1), makeFrame(msg2), makeFrame(msg3));
    const messages = parseBinaryFrames(combined.buffer);

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual(msg1);
    expect(messages[1]).toEqual(msg2);
    expect(messages[2]).toEqual(msg3);
  });

  it("returns empty array for empty input", () => {
    const empty = new ArrayBuffer(0);
    const messages = parseBinaryFrames(empty);

    expect(messages).toHaveLength(0);
    expect(messages).toEqual([]);
  });

  it("handles truncated frame gracefully (incomplete length header)", () => {
    // Only 2 bytes -- not enough for a 4-byte length header
    const truncated = new Uint8Array([0x00, 0x00]);
    const messages = parseBinaryFrames(truncated.buffer);

    expect(messages).toHaveLength(0);
  });

  it("handles truncated frame gracefully (incomplete payload)", () => {
    const original = { data: "some content here" };
    const frame = makeFrame(original);
    // Chop off the last 5 bytes so payload is incomplete
    const truncated = frame.slice(0, frame.length - 5);
    const messages = parseBinaryFrames(truncated.buffer);

    expect(messages).toHaveLength(0);
  });

  it("parses complete frames and stops at truncated trailing frame", () => {
    const msg1 = { id: 1 };
    const msg2 = { id: 2, incomplete: true };
    const frame1 = makeFrame(msg1);
    const frame2 = makeFrame(msg2);
    // Include all of frame1 but truncate frame2
    const combined = concat(frame1, frame2.slice(0, frame2.length - 3));
    const messages = parseBinaryFrames(combined.buffer);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg1);
  });

  it("parses a real-world StreamMessage-shaped payload", () => {
    const streamMessage = {
      i: "session-abc-123",
      m: true,
      n: 1,
      s: 1,
      t: [
        {
          a: true,
          e: false,
          f: [
            { h: "<div>Result card HTML</div>", i: 0 },
            { h: "<div>Another result</div>", i: 1 },
          ],
          i: 0,
          ne: false,
          q: "machine learning papers 2024",
          qr: false,
          s: "Found 2 results",
        },
      ],
      tl: false,
      y: 0,
    };

    const frame = makeFrame(streamMessage);
    const messages = parseBinaryFrames(frame.buffer);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(streamMessage);
  });

  it("handles large payload (>256 bytes) with multi-byte length", () => {
    // Build a payload larger than 256 bytes to exercise multi-byte length encoding
    const largeObj: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      largeObj[`key_${i}`] = `value_${i}_${"x".repeat(20)}`;
    }
    const json = JSON.stringify(largeObj);
    // Verify payload is actually > 256 bytes
    expect(new TextEncoder().encode(json).length).toBeGreaterThan(256);

    const frame = makeFrame(largeObj);
    const messages = parseBinaryFrames(frame.buffer);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(largeObj);
  });
});

describe("createFrameParser (streaming)", () => {
  it("extracts frames from a single complete chunk", () => {
    const parser = createFrameParser();
    const msg = { streaming: true };
    const frame = makeFrame(msg);

    const messages = parser.push(frame);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  it("buffers partial frame until complete", () => {
    const parser = createFrameParser();
    const msg = { key: "value" };
    const frame = makeFrame(msg);

    // Push first half
    const half = Math.floor(frame.length / 2);
    const part1 = frame.slice(0, half);
    const part2 = frame.slice(half);

    const messages1 = parser.push(part1);
    expect(messages1).toHaveLength(0);

    const messages2 = parser.push(part2);
    expect(messages2).toHaveLength(1);
    expect(messages2[0]).toEqual(msg);
  });

  it("handles multiple frames across multiple chunks", () => {
    const parser = createFrameParser();
    const msg1 = { n: 1 };
    const msg2 = { n: 2 };
    const msg3 = { n: 3 };

    const combined = concat(makeFrame(msg1), makeFrame(msg2), makeFrame(msg3));

    // Split into 3 uneven chunks
    const chunk1 = combined.slice(0, 10);
    const chunk2 = combined.slice(10, combined.length - 5);
    const chunk3 = combined.slice(combined.length - 5);

    const r1 = parser.push(chunk1);
    const r2 = parser.push(chunk2);
    const r3 = parser.push(chunk3);

    const allMessages = [...r1, ...r2, ...r3];
    expect(allMessages).toHaveLength(3);
    expect(allMessages[0]).toEqual(msg1);
    expect(allMessages[1]).toEqual(msg2);
    expect(allMessages[2]).toEqual(msg3);
  });

  it("handles chunk boundary in the middle of length header", () => {
    const parser = createFrameParser();
    const msg = { split: "header" };
    const frame = makeFrame(msg);

    // Split at byte 2 (middle of the 4-byte length header)
    const part1 = frame.slice(0, 2);
    const part2 = frame.slice(2);

    const messages1 = parser.push(part1);
    expect(messages1).toHaveLength(0);

    const messages2 = parser.push(part2);
    expect(messages2).toHaveLength(1);
    expect(messages2[0]).toEqual(msg);
  });

  it("flush clears internal buffer and returns empty array", () => {
    const parser = createFrameParser();
    const msg = { data: "test" };
    const frame = makeFrame(msg);

    // Push partial frame
    parser.push(frame.slice(0, 3));
    const flushed = parser.flush();

    expect(flushed).toEqual([]);

    // After flush, a new complete frame should parse correctly
    const messages = parser.push(makeFrame({ after: "flush" }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ after: "flush" });
  });

  it("handles byte-by-byte delivery", () => {
    const parser = createFrameParser();
    const msg = { a: 1 };
    const frame = makeFrame(msg);

    const allMessages: unknown[] = [];
    for (let i = 0; i < frame.length; i++) {
      const chunk = frame.slice(i, i + 1);
      allMessages.push(...parser.push(chunk));
    }

    expect(allMessages).toHaveLength(1);
    expect(allMessages[0]).toEqual(msg);
  });
});
