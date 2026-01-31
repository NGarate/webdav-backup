import * as logger from "./logger.js";

export interface ErrorResult {
  success: false;
  error: string;
}

export const handleError = (
  error: unknown,
  context: string,
  verbosity?: number
): ErrorResult => {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error(`${context}: ${msg}`, verbosity);
  return { success: false, error: msg };
};

export const formatError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export const throwError = (message: string): never => {
  throw new Error(message);
};
