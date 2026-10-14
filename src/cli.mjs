import packageJson from "../package.json" with { type: "json" };
import { parseArgs } from "./args.mjs";
import { help } from "./help.mjs";
import { runApiCommand } from "./api-commands.mjs";

export async function runCli(argv) {
  const { positionals, options } = parseArgs(argv);
  if (options.version) return console.log(JSON.stringify({ version: packageJson.version }));
  if (positionals[0] === "help")
    return console.log(JSON.stringify({ help: help(positionals.slice(1)) }));
  if (!positionals.length || options.help)
    return console.log(JSON.stringify({ help: help(positionals) }));
  const [command, ...ids] = positionals;
  return runApiCommand(command, ids, options);
}
