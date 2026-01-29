#!/bin/bash
# List all tables in the ts_jgasys schema

CONTAINER_NAME="${1:-humandbs-jga-shinsei-db}"

docker exec -it "$CONTAINER_NAME" psql -U postgres -d jgadb -c "
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
FROM pg_tables
WHERE schemaname = 'ts_jgasys'
ORDER BY tablename;
"
