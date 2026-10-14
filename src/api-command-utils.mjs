import { apiRequest } from "./api.mjs";
import { output } from "./output.mjs";
import { readJsonInput } from "./json-input.mjs";

export function query(options, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    if (options[key] !== undefined) params.set(key, String(options[key]));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

export async function many(ids, path, options) {
  const results = [];
  for (const id of ids) results.push(await apiRequest(path(id)));
  return output(results.length === 1 ? results[0] : results, options);
}

export function ownerAddress() {
  const address = process.env.MAIL_OWNER_ADDRESS?.trim();
  if (!address) {
    const error = new Error("MAIL_OWNER_ADDRESS must be configured for mailbox commands");
    error.code = "MAIL_OWNER_ADDRESS_REQUIRED";
    throw error;
  }
  return address;
}

export function commandJsonInput(options) {
  return readJsonInput({
    ...options,
    readStdin: options.inputJson === undefined && options.input === undefined,
  });
}
