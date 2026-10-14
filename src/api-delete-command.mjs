import { apiRequest } from "./api.mjs";
import { output } from "./output.mjs";
import { commandJsonInput } from "./api-command-utils.mjs";

export async function runDeleteCommand(command, _ids, options) {
  if (command !== "delete") return undefined;
  const request = await commandJsonInput(options);
  const requestIds = Array.isArray(request.ids) ? request.ids : [];
  const queryText = request.query;
  if (!requestIds.length && !queryText) {
    const error = new Error("delete JSON input requires ids or query");
    error.code = "DELETE_TARGET_REQUIRED";
    throw error;
  }
  const results = queryText
    ? (await apiRequest(`/api/search?q=${encodeURIComponent(queryText)}`)).results
    : requestIds.map((id) => ({ id }));
  if (options["dry-run"] || request.dryRun)
    return output({ dryRun: true, action: "delete", ids: results.map(({ id }) => id) }, options);
  if (request.confirm !== true) {
    const error = new Error("delete JSON input requires confirm: true");
    error.code = "DELETE_CONFIRMATION_REQUIRED";
    throw error;
  }
  const deleted = [];
  for (const item of results) {
    const kind = item.kind ?? "inbound";
    const route = kind === "outbound" ? "sent" : "messages";
    await apiRequest(`/api/${route}/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    deleted.push(item.id);
  }
  return output({ deleted }, options);
}
