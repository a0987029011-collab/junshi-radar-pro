export async function readJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    await response.text().catch(() => "");
    throw new Error(fallbackMessage);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
