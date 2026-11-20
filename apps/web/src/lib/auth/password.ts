import { hash, verify, type Algorithm } from "@node-rs/argon2";

export interface Argon2Options {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export const DEFAULT_ARGON2_OPTIONS: Argon2Options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// 2 corresponds to Algorithm.Argon2id in @node-rs/argon2
const ARGON2ID_ALGORITHM = 2 as Algorithm;

export async function hashPassword(
  password: string,
  options: Partial<Argon2Options> = {}
): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  const memoryCost = Math.max(options.memoryCost ?? DEFAULT_ARGON2_OPTIONS.memoryCost, 19456);
  const timeCost = Math.max(options.timeCost ?? DEFAULT_ARGON2_OPTIONS.timeCost, 2);
  const parallelism = options.parallelism ?? DEFAULT_ARGON2_OPTIONS.parallelism;

  return hash(password, {
    algorithm: ARGON2ID_ALGORITHM,
    memoryCost,
    timeCost,
    parallelism,
  });
}

export async function verifyPassword(
  hashValue: string,
  password: string
): Promise<boolean> {
  if (!hashValue || !password || typeof hashValue !== "string" || typeof password !== "string") {
    return false;
  }

  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}
