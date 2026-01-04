// @agentstore/common - Result type for error handling

/**
 * A Result type for explicit error handling without exceptions.
 * Use this for operations that can fail in expected ways.
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Creates a successful result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Creates a failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wraps a promise in a Result, catching any errors
 */
export async function tryCatch<T>(
  promise: Promise<T>
): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Maps over a successful result
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (result.success) {
    return ok(fn(result.data));
  }
  return result;
}

/**
 * Maps over a failed result
 */
export function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (!result.success) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chains results together
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (result.success) {
    return fn(result.data);
  }
  return result;
}

/**
 * Unwraps a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw result.error;
}

/**
 * Gets the value or a default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.success) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Combines multiple results into one
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const data: T[] = [];
  for (const result of results) {
    if (!result.success) {
      return result;
    }
    data.push(result.data);
  }
  return ok(data);
}
