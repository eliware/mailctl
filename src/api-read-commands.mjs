import { apiRequest } from "./api.mjs";
import { output } from "./output.mjs";
import { many, ownerAddress, query } from "./api-command-utils.mjs";

export async function runReadCommand(command, ids, options) {
  const listQuery = query(options, [
    "limit",
    "before",
    "after",
    "search",
    "folder",
    "domain",
    "address",
    "from",
    "to",
  ]);
  if (command === "inbox") {
    const scoped = { ...options, address: ownerAddress() };
    return output(
      await apiRequest(
        `/api/inbox${query(scoped, ["limit", "before", "after", "search", "folder", "domain", "address"])}`,
      ),
      options,
    );
  }
  if (command === "list") return output(await apiRequest(`/api/messages${listQuery}`), options);
  if (command === "headers")
    return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}/headers`, options);
  if (command === "read")
    return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}`, options);
  if (command === "search") {
    const response = await apiRequest(`/api/search?q=${encodeURIComponent(ids[0])}`);
    return output(response.results, options);
  }
  if (command === "thread")
    return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}/thread`, options);
  if (command === "sent") {
    const scoped = { ...options, from: ownerAddress() };
    return output(
      await apiRequest(
        `/api/sent${query(scoped, ["limit", "before", "after", "search", "from", "to"])}`,
      ),
      options,
    );
  }
  if (command === "sent-read")
    return many(ids, (id) => `/api/sent/${encodeURIComponent(id)}`, options);
  if (command === "outbound-status")
    return many(ids, (id) => `/api/sent/${encodeURIComponent(id)}/status`, options);
  if (command === "health") {
    const status = await apiRequest("/api/status");
    const healthy = status.readiness?.ready === true;
    process.exitCode = healthy ? 0 : 1;
    return output({ ...status, healthy }, options);
  }
  if (command === "domains") return output(await apiRequest("/api/domains"), options);
  return undefined;
}
