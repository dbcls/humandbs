#!/bin/bash
#
# 開発用の DB に、申請管理システム (jgasys) の足場を作る。
#
# **これは prod の複製ではない。** 画面 (`/admin/research/upstream`) を手元で
# 見るための足場で、行の分布も、他プロジェクトが今後入れる変更も追わない。
# SQL が prod で通るかは staging / prod の integration test が見る。
#
# **schema を手で書かない。** DDL は prod から取った列定義の生ダンプから機械
# 生成したもので、view の定義は prod の `pg_views` そのまま。材料は repo の外
# (`$JGA_DIR`) にあり、取り直しは `$JGA_DIR/dump.sh` が踏み台経由で行う。
#
#   docker compose up -d db
#   scripts/seed-jga-dev.sh
#
set -euo pipefail

JGA_DIR=${JGA_DIR:-"$HOME/git/github.com/dbcls/humandbs/.claude/jga-db"}
DATA="$JGA_DIR/data"
cd "$(dirname "$0")/.."

[ -f "$JGA_DIR/jgasys-dev.sql" ] || { echo "no DDL at $JGA_DIR/jgasys-dev.sql" >&2; exit 1; }

# 読むのはアプリの接続。`.env` の URL から利用者名を取る。
APP_USER=$(sed -nE 's|^HUMANDBS_DATABASE_URL=[a-z]+://([^:]+):.*|\1|p' .env | head -1)
[ -n "$APP_USER" ] || { echo "cannot read the application's user from .env" >&2; exit 1; }

sql() { docker compose exec -T db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q'; }

# `\copy` は psql のメタコマンドなので、続けて流した CSV を stdin から読む。
load() {
  local target=$1 file=$2
  [ -f "$file" ] || { echo "missing $file" >&2; exit 1; }
  { printf '\\copy %s FROM STDIN WITH (FORMAT csv, HEADER)\n' "$target"; cat "$file"; } | sql
  printf '  %-52s %8d rows\n' "$target" "$(($(wc -l < "$file") - 1))"
}

echo "== schema"
echo "DROP SCHEMA IF EXISTS jgasys CASCADE;" | sql
sql < "$JGA_DIR/jgasys-dev.sql"

echo "== 列がそのまま合うもの"
load "jgasys.accession (accession_id, alias, accession, group_id)"                                        "$DATA/accession_top.csv"
load "jgasys.nbdc_application_master (appl_master_id, ds_du_id, account_group, data_type, create_date)"   "$DATA/appl_master.csv"
load "jgasys.nbdc_application (appl_id, ds_du_id, appl_version, application_type, data_access, language_type, is_check, create_date, hum_id)" "$DATA/application.csv"
load "jgasys.nbdc_application_submit (appl_submit_id, appl_id, update_type, current_form_name, submit_date, create_date)" "$DATA/appl_submit.csv"
load "jgasys.nbdc_application_status_history (appl_status_history_id, appl_id, appl_status_type, history_date)" "$DATA/status_history.csv"
load "jgasys.nbdc_phase_history (phase_id, ds_du_id, phase_type, history_date)"                          "$DATA/phase_history.csv"
load "jgasys.nbdc_report_mgr (report_id, ds_du_id, scheduled_date, schedule_status_type, report_count, appl_id)" "$DATA/report_mgr.csv"
load "jgasys.submission_permission (submission_permission_id, appl_id, submission_id)"                   "$DATA/submission_permission.csv"
load "jgasys.submission (submission_id, group_id, hold_date)"                                            "$DATA/submission.csv"
load "jgasys.status (status_id, submission_id, status_type, status_date)"                                "$DATA/submission_status.csv"
load "jgasys.entry (entry_id, submission_id, entry_version, entry_date, fileset_version_id)"             "$DATA/entry.csv"
load "jgasys.dataset_versions (ds_ver_id, accession_id, entry_id, entry_time, exit_time, fileset_version_id)" "$DATA/dataset_versions.csv"
load "jgasys.fileset_versions (fileset_version_id, update_date, v_version, p_version, accession_id, entry_id, batch_id)" "$DATA/fileset_versions.csv"
load "jgasys.metadata (metadata_id, accession_id, metadata_version, metadata_type, metadata, create_date)" "$DATA/metadata_dataset.csv"

echo "== 取り出しかたが違うもの (一時表を挟む)"
{
  cat <<'SQL'
CREATE TABLE jgasys._t_use_permission (use_permission_id bigint, appl_id bigint, dataset_id bigint, accession text);
CREATE TABLE jgasys._t_use_period (use_period_id bigint, ds_du_id varchar(10), expire_date date, is_lock boolean, has_public_key boolean);
CREATE TABLE jgasys._t_acc_status (accession_id bigint, accession text, accession_status integer, status_date timestamptz, group_id text);
CREATE TABLE jgasys._t_component (appl_component_id bigint, appl_id bigint, ds_du_id text, appl_version integer, key text, value text, t_order integer, create_date timestamptz);
CREATE TABLE jgasys._t_component_submit (appl_component_id bigint, appl_submit_id bigint);
SQL
} | sql

load "jgasys._t_use_permission"        "$DATA/use_permission.csv"
load "jgasys._t_use_period"            "$DATA/use_period.csv"
load "jgasys._t_acc_status"            "$DATA/accession_status_top.csv"
load "jgasys._t_component"             "$DATA/component_ids.csv"
load "jgasys._t_component"             "$DATA/component_form.csv"
load "jgasys._t_component_submit"      "$DATA/component_submit.csv"

{
  cat <<'SQL'
INSERT INTO jgasys.use_permission (use_permission_id, appl_id, dataset_id)
  SELECT use_permission_id, appl_id, dataset_id FROM jgasys._t_use_permission;

-- public_key は本文を取っていない。有無だけが残っているので、あったことを印にする。
INSERT INTO jgasys.nbdc_use_period (use_period_id, ds_du_id, expire_date, is_lock, public_key)
  SELECT use_period_id, ds_du_id, expire_date, is_lock,
         CASE WHEN has_public_key THEN '(not dumped)' END
  FROM jgasys._t_use_period;

-- 取ってあるのは view (current_accession_status) の出力なので、履歴の id は無い。
INSERT INTO jgasys.accession_history (accession_history_id, accession_id, accession_status, status_date)
  SELECT row_number() OVER (ORDER BY accession_id), accession_id, accession_status, status_date
  FROM jgasys._t_acc_status;

-- 申請書の中身は appl_id で join した形でしか取っていないので、外部キーを戻す。
INSERT INTO jgasys.nbdc_application_component (appl_component_id, appl_submit_id, key, value, t_order, create_date)
  SELECT DISTINCT ON (c.appl_component_id) c.appl_component_id, s.appl_submit_id, c.key, c.value, c.t_order, c.create_date
  FROM jgasys._t_component c
  JOIN jgasys._t_component_submit s ON s.appl_component_id = c.appl_component_id
  ORDER BY c.appl_component_id;

DROP TABLE jgasys._t_use_permission, jgasys._t_use_period, jgasys._t_acc_status,
           jgasys._t_component, jgasys._t_component_submit;
SQL
} | sql

echo "== 読ませる (接続は read-only を強制するので SELECT だけでよい)"
{
  printf 'GRANT USAGE ON SCHEMA jgasys TO %s;\n' "$APP_USER"
  printf 'GRANT SELECT ON ALL TABLES IN SCHEMA jgasys TO %s;\n' "$APP_USER"
  printf 'ALTER DEFAULT PRIVILEGES IN SCHEMA jgasys GRANT SELECT ON TABLES TO %s;\n' "$APP_USER"
} | sql

echo "== index (JOIN する列だけ)"
{
  cat <<'SQL'
CREATE INDEX ON jgasys.accession (accession_id);
CREATE INDEX ON jgasys.accession (accession);
CREATE INDEX ON jgasys.metadata (accession_id);
CREATE INDEX ON jgasys.nbdc_application (appl_id);
CREATE INDEX ON jgasys.nbdc_application (ds_du_id);
CREATE INDEX ON jgasys.nbdc_application_submit (appl_id);
CREATE INDEX ON jgasys.nbdc_application_component (appl_submit_id);
CREATE INDEX ON jgasys.nbdc_application_status_history (appl_id);
CREATE INDEX ON jgasys.nbdc_phase_history (ds_du_id);
CREATE INDEX ON jgasys.submission_permission (appl_id);
CREATE INDEX ON jgasys.use_permission (appl_id);
SQL
} | sql

echo "== 入った数"
{
  cat <<'SQL'
SELECT 'accession', count(*) FROM jgasys.accession
UNION ALL SELECT 'nbdc_application', count(*) FROM jgasys.nbdc_application
UNION ALL SELECT 'nbdc_application_component', count(*) FROM jgasys.nbdc_application_component
UNION ALL SELECT 'metadata', count(*) FROM jgasys.metadata
UNION ALL SELECT 'current_nbdc_application_status', count(*) FROM jgasys.current_nbdc_application_status
UNION ALL SELECT 'current_nbdc_phase', count(*) FROM jgasys.current_nbdc_phase
UNION ALL SELECT 'current_entry', count(*) FROM jgasys.current_entry;
SQL
} | docker compose exec -T db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At'
