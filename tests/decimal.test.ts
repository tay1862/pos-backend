import { describe, expect, test } from "bun:test";
import { compareDecimals, decimalToMicros, divideDecimal, subtractDecimal } from "../src/modules/sales/decimal";

describe("decimal arithmetic", () => {
  test("supports negative deltas with fixed six-decimal output", () => {
    expect(subtractDecimal("8.000000", "10.000000")).toBe("-2.000000");
    expect(compareDecimals("-2.000000", "0.000000")).toBe(-1);
    expect(decimalToMicros("-0.500000")).toBe(-500000n);
  });

  test("divides decimal values with fixed six-decimal rounding", () => {
    expect(divideDecimal("10.000000", "4.000000")).toBe("2.500000");
  });
});
