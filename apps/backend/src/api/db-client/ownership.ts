import { jgaSql, JGA_DB_SCHEMA } from "@/api/db-client/client"

interface OwnershipRow {
  hum_id: string
  username: string
}

export const fetchAllOwnership = async (): Promise<OwnershipRow[]> => {
  const rows = await jgaSql.begin(async (tx) => {
    await tx.unsafe(`SET search_path TO ${JGA_DB_SCHEMA}, public`)
    return await tx.unsafe<OwnershipRow[]>(`
      SELECT DISTINCT na.hum_id, nc.value AS username
      FROM nbdc_application na
      JOIN nbdc_application_master nam ON na.ds_du_id = nam.ds_du_id
      JOIN nbdc_application_submit ns ON na.appl_id = ns.appl_id
      JOIN nbdc_application_component nc ON ns.appl_submit_id = nc.appl_submit_id
      WHERE nam.data_type = 1
        AND na.hum_id IS NOT NULL AND na.hum_id NOT IN ('', 'N/A')
        AND nc.key IN ('pi_account_id', 'submitter_account_id', 'member_account_id')
        AND nc.value IS NOT NULL AND nc.value != ''
    `)
  })

  return rows as OwnershipRow[]
}
