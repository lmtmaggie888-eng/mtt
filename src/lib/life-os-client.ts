const LIFE_OS_BASE_URL = process.env.LIFE_OS_API_BASE?.trim() || null;

export function hasRemoteLifeOs() {
  return Boolean(LIFE_OS_BASE_URL);
}

export async function lifeOsFetch(path: string, init?: RequestInit) {
  if (!LIFE_OS_BASE_URL) {
    throw new Error("LIFE_OS_API_BASE is not configured");
  }

  return fetch(`${LIFE_OS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}
