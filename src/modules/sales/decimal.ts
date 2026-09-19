const SCALE = 1_000_000n;

export function decimalToMicros(value: string): bigint {
  const sign = value.startsWith("-") ? -1n : 1n;
  const unsigned = sign < 0n ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  if (!whole || !/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > 6) {
    throw new Error("Invalid decimal");
  }

  return sign * (BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0")));
}

export function microsToDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(6, "0");
  return `${sign}${whole}.${fraction}`;
}

export function multiplyDecimal(left: string, right: string): string {
  return microsToDecimal((decimalToMicros(left) * decimalToMicros(right) + SCALE / 2n) / SCALE);
}

export function divideDecimal(left: string, right: string): string {
  const numerator = decimalToMicros(left) * SCALE;
  const denominator = decimalToMicros(right);
  if (denominator === 0n) throw new Error("Division by zero");
  const sign = numerator < 0n === denominator < 0n ? 1n : -1n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator;
  return microsToDecimal(sign * rounded);
}

export function addDecimals(values: string[]): string {
  return microsToDecimal(values.reduce((sum, value) => sum + decimalToMicros(value), 0n));
}

export function subtractDecimal(left: string, right: string): string {
  return microsToDecimal(decimalToMicros(left) - decimalToMicros(right));
}

export function compareDecimals(left: string, right: string): number {
  const difference = decimalToMicros(left) - decimalToMicros(right);
  if (difference < 0n) return -1;
  if (difference > 0n) return 1;
  return 0;
}
