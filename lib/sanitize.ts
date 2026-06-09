export function sanitizeInput(input: string, maxLength = 500): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[<>'"`;]/g, "") // strip injection chars
    .trim()
    .slice(0, maxLength);
}
