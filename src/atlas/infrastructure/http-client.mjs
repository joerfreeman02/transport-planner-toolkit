export const HTTP_FAILURE = Object.freeze({
  TIMEOUT: 'timeout',
  HTTP: 'http_failure',
  INVALID_RESPONSE: 'invalid_response',
  UNAVAILABLE: 'unavailable_source'
});

function headerObject(headers) {
  if (!headers || typeof headers.entries !== 'function') return {};
  return Object.fromEntries(headers.entries());
}

export async function requestJson({ url, fetchImpl = globalThis.fetch, timeoutMs = 12000, headers = {} }) {
  if (typeof fetchImpl !== 'function') return { ok: false, code: HTTP_FAILURE.UNAVAILABLE, message: 'No HTTP client is available.', url };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    if (!response || typeof response.ok !== 'boolean') return { ok: false, code: HTTP_FAILURE.INVALID_RESPONSE, message: 'Source returned an invalid HTTP response object.', url };
    if (!response.ok) return { ok: false, code: HTTP_FAILURE.HTTP, message: `Source returned HTTP ${response.status}.`, status: response.status, url, headers: headerObject(response.headers) };
    let data;
    try {
      data = await response.json();
    } catch (error) {
      return { ok: false, code: HTTP_FAILURE.INVALID_RESPONSE, message: `Source returned invalid JSON: ${error.message}`, status: response.status, url, headers: headerObject(response.headers) };
    }
    return { ok: true, data, status: response.status, url, headers: headerObject(response.headers) };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, code: HTTP_FAILURE.TIMEOUT, message: `Source request timed out after ${timeoutMs} ms.`, url };
    return { ok: false, code: HTTP_FAILURE.UNAVAILABLE, message: `Source request failed: ${error?.message || 'unknown network error'}`, url };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestText({ url, fetchImpl = globalThis.fetch, timeoutMs = 30000, headers = {} }) {
  if (typeof fetchImpl !== 'function') return { ok: false, code: HTTP_FAILURE.UNAVAILABLE, message: 'No HTTP client is available.', url };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1', ...headers } });
    if (!response || typeof response.ok !== 'boolean') return { ok: false, code: HTTP_FAILURE.INVALID_RESPONSE, message: 'Source returned an invalid HTTP response object.', url };
    if (!response.ok) return { ok: false, code: HTTP_FAILURE.HTTP, message: `Source returned HTTP ${response.status}.`, status: response.status, url, headers: headerObject(response.headers) };
    let data;
    try {
      data = await response.text();
    } catch (error) {
      return { ok: false, code: HTTP_FAILURE.INVALID_RESPONSE, message: `Source returned unreadable text: ${error.message}`, status: response.status, url, headers: headerObject(response.headers) };
    }
    return { ok: true, data, status: response.status, url, headers: headerObject(response.headers) };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, code: HTTP_FAILURE.TIMEOUT, message: `Source request timed out after ${timeoutMs} ms.`, url };
    return { ok: false, code: HTTP_FAILURE.UNAVAILABLE, message: `Source request failed: ${error?.message || 'unknown network error'}`, url };
  } finally {
    clearTimeout(timer);
  }
}
