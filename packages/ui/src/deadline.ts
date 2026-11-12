export function withDeadline<T>(
  start: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  ms: number,
): Promise<T> {
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onParent = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    onParent = () => {
      request.abort(parent.reason);
      reject(parent.reason);
    };
    if (parent.aborted) {
      reject(parent.reason);
      return;
    }
    parent.addEventListener("abort", onParent, { once: true });
    timer = setTimeout(() => {
      const error = new DOMException(
        "The operation timed out.",
        "TimeoutError",
      );
      request.abort(error);
      reject(error);
    }, ms);
    start(request.signal).then(resolve, reject);
  });
  return promise.finally(() => {
    clearTimeout(timer);
    parent.removeEventListener("abort", onParent);
  });
}
