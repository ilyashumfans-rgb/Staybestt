export function getSecureItem(key: string): Promise<string | null>;
export function setSecureItem(key: string, value: string): Promise<void>;
export function deleteSecureItem(key: string): Promise<void>;