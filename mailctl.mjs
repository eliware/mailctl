#!/usr/bin/env node
import "./src/config.mjs";
import process from "node:process";
import packageJson from "./package.json" with { type: "json" };
import { log, registerHandlers, registerSignals } from "@eliware/common";
import { parseArgs, required } from "./src/args.mjs";
import { help } from "./src/help.mjs";
import { output } from "./src/output.mjs";
import { apiModeConfigured } from "./src/api.mjs";
import { runApiCommand } from "./src/api-commands.mjs";

registerHandlers({ log });
registerSignals({ log, exitCode: 1, shutdownHook: async () => {} });

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (options.version) return console.log(packageJson.version);
  if (positionals[0] === "help") return console.log(help(positionals.slice(1)));
  if (!positionals.length || options.help)
    return console.log(help(positionals));
  const [command, ...ids] = positionals;
  if (apiModeConfigured() && command !== "migrate")
    return await runApiCommand(command, ids, options);
  const [{ dbConnection }, { listMessages, readMessages, searchMail, thread }, { listSent, readSent, outboundStatus, updateOutbound, send }, { attachmentList, saveAttachments, saveSentAttachments }, { deleteMail }, { health }, { runMigrations }] = await Promise.all([
    import("./src/runtime.mjs"),
    import("./src/inbound.mjs"),
    import("./src/outbound.mjs"),
    import("./src/attachments.mjs"),
    import("./src/delete.mjs"),
    import("./src/health.mjs"),
    import("./src/migrations.mjs"),
  ]);
  const db = await dbConnection();
  try {
    if (command === "list") return await listMessages(options, db);
    if (command === "headers")
      return await readMessages(ids, options, db, false);
    if (command === "read") return await readMessages(ids, options, db, true);
    if (command === "sent") return await listSent(options, db);
    if (command === "sent-read") return await readSent(ids, options, db);
    if (command === "outbound-status") return await outboundStatus(ids, options, db);
    if (command === "search")
      return await searchMail(
        required({ query: ids[0] }, "query"),
        options,
        db,
      );
    if (command === "thread") return await thread(ids[0], options, db);
    if (command === "retry" || command === "cancel")
      return await updateOutbound(ids, command, options, db);
    if (command === "health") return await health(options, db);
    if (command === "migrate") {
      if (!options.yes && process.env.MIGRATE_CONFIRM !== "apply")
        throw new Error("migration writes require --yes or MIGRATE_CONFIRM=apply");
      const result = await runMigrations({ pool: db, confirm: true });
      return output(result, options);
    }
    if (command === "attachments")
      return await attachmentList(ids[0], options, db);
    if (command === "save-attachments")
      return await saveAttachments(
        ids[0],
        ids[1] ?? options.directory,
        options,
        db,
      );
    if (command === "save-sent-attachments")
      return await saveSentAttachments(
        ids[0],
        ids[1] ?? options.directory,
        options,
        db,
      );
    if (command === "domains") {
      const [rows] = await db.query(
        "SELECT domain_id,name,status,created_at,updated_at FROM domains ORDER BY name",
      );
      return output(rows, options);
    }
    if (command === "delete") return await deleteMail(ids, options, db);
    if (command === "send") return await send(options, db);
    throw new Error(`unknown command: ${command}`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  const { options } = parseArgs(process.argv.slice(2));
  const payload = { error: error.message, code: error.code ?? "MAILCTL_ERROR" };
  if (options.json) console.error(JSON.stringify(payload));
  else log.error("mailctl command failed", payload);
  process.exitCode = 1;
});
