import { describe, expect, it } from "vitest";
import { messageText, mockChat, validateMessages } from "../../server/src/mock";

describe("server chat validation", () => {
  it("accepts system/user/assistant messages", () => {
    expect(
      validateMessages([
        { role: "system", content: "rules" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]),
    ).toEqual([
      { role: "system", content: "rules" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("rejects empty, malformed, oversized or image-heavy messages", () => {
    expect(validateMessages([])).toBeNull();
    expect(validateMessages("nope")).toBeNull();
    expect(validateMessages([{ role: "tool", content: "x" }])).toBeNull();
    expect(
      validateMessages(Array.from({ length: 201 }, () => ({ role: "user", content: "x" }))),
    ).toBeNull();
    const images = Array.from({ length: 5 }, () => ({ type: "image_url" }));
    expect(validateMessages([{ role: "user", content: images }])).toBeNull();
  });

  it("extracts text parts and keeps the mock stream shape", () => {
    expect(
      messageText({
        role: "user",
        content: [
          { type: "text", text: "first" },
          { type: "image_url", image_url: { url: "data:" } },
          { type: "text", text: "second" },
        ],
      }),
    ).toBe("first\nsecond");

    const response = mockChat([{ role: "user", content: "test" }]);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).not.toBeNull();
  });
});
