export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? 'The server returned an unreadable response. Please try again.'
        : 'Request failed. Please try again.',
    );
  }
  if (!response.ok) throw new Error(result.message || 'Request failed. Please try again.');
  return result;
}
