#!/bin/bash
set -e

DB_FILE="${JOOMLA_DB_FILE:-mysqldump_humandbs.dbcls.jp.sql}"

echo "=== Joomla DB Import ==="
echo "Importing from: /dumps/$DB_FILE"
echo "This may take several minutes..."

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" joomla < "/dumps/$DB_FILE"

echo "=== Import completed! ==="
