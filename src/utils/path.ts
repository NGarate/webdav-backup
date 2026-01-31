import path from "node:path";

export const normalizePath = (p: string): string => p.replace(/\\/g, "/");

export const joinPath = (...parts: string[]): string => {
  const joined = path.join(...parts);
  return normalizePath(joined);
};

export const getRelativePath = (from: string, to: string): string => {
  const relative = path.relative(from, to);
  return normalizePath(relative);
};

export const getBasename = (p: string): string => path.basename(p);

export const getDirname = (p: string): string => path.dirname(p);

export const isAbsolutePath = (p: string): boolean => path.isAbsolute(p);

export const resolvePath = (...paths: string[]): string => {
  const resolved = path.resolve(...paths);
  return normalizePath(resolved);
};
