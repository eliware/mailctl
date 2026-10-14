import { apiRequest } from "./api.mjs";
import { output } from "./output.mjs";
import { commandJsonInput } from "./api-command-utils.mjs";

export async function runDeliveryCommand(command, ids, options) {
  if (command === "retry" || command === "cancel") {
    const request = await commandJsonInput(options);
    const requestIds = request.ids;
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      const error = new Error(`${command} JSON input requires a non-empty ids array`);
      error.code = "OUTBOUND_IDS_REQUIRED";
      throw error;
    }
    if (options["dry-run"] || request.dryRun)
      return output({ dryRun: true, action: command, outboundIds: requestIds }, options);
    const results = [];
    for (const id of requestIds)
      results.push(
        await apiRequest(`/api/sent/${encodeURIComponent(id)}/${command}`, { method: "POST" }),
      );
    return output(results.length === 1 ? results[0] : results, options);
  }
  if (command !== "retry-uncertain") return undefined;
  const request = await commandJsonInput(options);
  if (
    typeof request.outbound_id !== "string" ||
    !request.outbound_id ||
    typeof request.delivery_id !== "string" ||
    !request.delivery_id
  ) {
    const error = new Error("retry-uncertain JSON input requires outbound_id and delivery_id");
    error.code = "UNCERTAIN_DELIVERY_REQUIRED";
    throw error;
  }
  if (request.confirm_duplicate_risk !== true) {
    const error = new Error("retry-uncertain JSON input requires confirm_duplicate_risk: true");
    error.code = "DUPLICATE_RISK_CONFIRMATION_REQUIRED";
    throw error;
  }
  if (options["dry-run"] || request.dryRun)
    return output(
      {
        dryRun: true,
        action: command,
        outboundId: request.outbound_id,
        deliveryId: request.delivery_id,
        duplicateRiskConfirmed: true,
      },
      options,
    );
  return output(
    await apiRequest(`/api/sent/${encodeURIComponent(request.outbound_id)}/retry-uncertain`, {
      method: "POST",
      body: { delivery_id: request.delivery_id, confirm_duplicate_risk: true },
    }),
    options,
  );
}
