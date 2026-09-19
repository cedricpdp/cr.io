import { describe, expect, it } from "vitest";
import { parsePositionLabel, positionLabel, rowLabel } from "./positions.js";

describe("box positions", () => {
  it("formats rows beyond Z", () => {
    expect(rowLabel(0)).toBe("A");
    expect(rowLabel(26)).toBe("AA");
    expect(positionLabel(15, 8)).toBe("B7");
  });

  it("parses case-insensitive coordinates within the box", () => {
    expect(parsePositionLabel("A7", 8, 8)).toBe(7);
    expect(parsePositionLabel(" b 7 ", 8, 8)).toBe(15);
    expect(parsePositionLabel("A9", 8, 8)).toBeUndefined();
    expect(parsePositionLabel("7", 8, 8)).toBeUndefined();
  });
});
