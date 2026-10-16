export * from "./generated/api";
export * from "./generated/api.schemas";
export * from "./amenities";
export {
  customFetch,
  setBaseUrl,
  setAuthTokenGetter,
  setAdminTokenGetter,
} from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
