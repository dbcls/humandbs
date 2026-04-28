import postgres from "postgres"

const JGA_DB_HOST = process.env.HUMANDBS_JGA_DB_HOST ?? ""
const JGA_DB_PORT = Number(process.env.HUMANDBS_JGA_DB_PORT ?? "5432")
const JGA_DB_USER = process.env.HUMANDBS_JGA_DB_USER ?? ""
const JGA_DB_PASSWORD = process.env.HUMANDBS_JGA_DB_PASSWORD ?? ""
const JGA_DB_NAME = process.env.HUMANDBS_JGA_DB_NAME ?? "jgadb"

export const JGA_DB_SCHEMA = process.env.HUMANDBS_JGA_DB_SCHEMA ?? "jgasys"

export const jgaSql = postgres({
  host: JGA_DB_HOST,
  port: JGA_DB_PORT,
  user: JGA_DB_USER,
  password: JGA_DB_PASSWORD,
  database: JGA_DB_NAME,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

/** Close all connections. Call on graceful shutdown. */
export const closeJgaDb = (): Promise<void> => jgaSql.end()
