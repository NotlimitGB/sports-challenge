export function getUserIdFromQuery(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("userId is required");
  }

  return value.trim();
}
