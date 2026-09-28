export async function getSecureItem(key: string) {
  return globalThis.localStorage?.getItem(key) ?? null;
}

export async function setSecureItem(key: string, value: string) {
  globalThis.localStorage?.setItem(key, value);
}

export async function deleteSecureItem(key: string) {
  globalThis.localStorage?.removeItem(key);
}