/**
 * CLI utilities for crawler commands
 */
import type { Argv } from "yargs"

import { setLogLevel } from "./logger"

export interface CommonCliOptions {
  verbose?: boolean
  quiet?: boolean
}

/**
 * Add common CLI options (verbose, quiet) to yargs builder
 */
export const withCommonOptions = <T>(builder: Argv<T>): Argv<T & CommonCliOptions> => {
  return builder
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Show debug logs",
    })
    .option("quiet", {
      alias: "q",
      type: "boolean",
      default: false,
      describe: "Show only warnings and errors",
    })
}

/**
 * Apply log level based on verbose/quiet flags
 */
export const applyLogLevel = (args: CommonCliOptions): void => {
  if (args.verbose) {
    setLogLevel("debug")
  } else if (args.quiet) {
    setLogLevel("warn")
  }
}
