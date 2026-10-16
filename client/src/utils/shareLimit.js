export function parseShareLimit(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const limit = Number(normalized);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
    throw new Error("Download limit must be a whole number from 1 to 100000, or blank for unlimited.");
  }

  return limit;
}
