import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule("../src/api.mjs", () => ({ apiRequest }));
jest.unstable_mockModule("../src/output.mjs", () => ({ output }));
const { runDeliveryCommand } = await import("../src/api-delivery-commands.mjs");

afterEach(() => jest.restoreAllMocks());
beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue({ status: "queued" });
  output.mockReset();
});

test("validates, previews, and submits retry and cancel requests", async () => {
  await expect(runDeliveryCommand("retry", [], { inputJson: {} })).rejects.toMatchObject({
    code: "OUTBOUND_IDS_REQUIRED",
  });
  await runDeliveryCommand("retry", [], { inputJson: { ids: ["o-1"], dryRun: true } });
  expect(apiRequest).not.toHaveBeenCalled();
  await runDeliveryCommand("retry", [], { inputJson: { ids: ["o-1", "o-2"] } });
  expect(apiRequest).toHaveBeenCalledTimes(2);
  await runDeliveryCommand("cancel", [], { inputJson: { ids: ["o-1"] } });
  expect(apiRequest).toHaveBeenLastCalledWith("/api/sent/o-1/cancel", { method: "POST" });
});

test("requires confirmation before uncertain delivery retry", async () => {
  await expect(runDeliveryCommand("retry-uncertain", [], { inputJson: {} })).rejects.toMatchObject({
    code: "UNCERTAIN_DELIVERY_REQUIRED",
  });
  await expect(
    runDeliveryCommand("retry-uncertain", [], {
      inputJson: { outbound_id: "o-1", delivery_id: "d-1" },
    }),
  ).rejects.toMatchObject({ code: "DUPLICATE_RISK_CONFIRMATION_REQUIRED" });
  await runDeliveryCommand("retry-uncertain", [], {
    inputJson: {
      outbound_id: "o-1",
      delivery_id: "d-1",
      confirm_duplicate_risk: true,
      dryRun: true,
    },
  });
  expect(output).toHaveBeenCalledWith(
    expect.objectContaining({ duplicateRiskConfirmed: true }),
    expect.any(Object),
  );
  await runDeliveryCommand("retry-uncertain", [], {
    inputJson: { outbound_id: "o/1", delivery_id: "d-1", confirm_duplicate_risk: true },
  });
  expect(apiRequest).toHaveBeenLastCalledWith("/api/sent/o%2F1/retry-uncertain", {
    method: "POST",
    body: { delivery_id: "d-1", confirm_duplicate_risk: true },
  });
});

test("returns no result for unrelated commands", async () => {
  await expect(runDeliveryCommand("delete", [], {})).resolves.toBeUndefined();
});
