const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export function isPositiveDecimalString(value: string): boolean {
  if (!POSITIVE_DECIMAL_PATTERN.test(value)) return false;
  return value.split(".").some((part) => /[1-9]/.test(part));
}
