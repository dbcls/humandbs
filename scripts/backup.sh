#!/bin/sh
# Copies a deployment's database and file store to another disk, or puts files
# from that copy back into the file store.
#
#   scripts/backup.sh [--dry-run]                         back up
#   scripts/backup.sh [--dry-run] restore-files <path>    copy <path> back
#
# Run in the deployment's directory, as the user that runs it; the backup is
# meant to run once a day. Everything is kept under HUMANDBS_BACKUP_DIR:
#
#   db/<date>-<time>.dump                 pg_dump -Fc, read back before it is kept
#   files/current/<bucket>/<key>          the file store as it was at the backup
#   files/deleted/<date>/<bucket>/<key>   what that day's backup found removed or
#                                         overwritten, as it was before
#   env/<date>.env                        the .env
#   last-success                          written once all of the above is done
#
# Dumps, .env copies and days of deleted files older than RETAIN_DAYS are
# removed. The number is one for all of them, so that any day within it can be
# restored whole: its database and the files that were there that day.
#
# <path> for restore-files is relative to files/: `current/<bucket>[/<key>]` or
# `deleted/<date>/<bucket>[/<key>]`. It is written to the same bucket and key;
# a key that is a prefix restores everything under it, no key the whole bucket.
# Nothing in the store is removed, and what has the same key is overwritten.
# `--dry-run` prints what would change the backup or the store instead of
# doing it.
#
# The file store is read through its S3 API, never by copying its data
# directory, which a running store may be halfway through writing. The store
# listens only inside the project's network, so rclone runs in a container
# started there. That container has no compose label, so deploy.sh does not
# count it among the project's containers.
set -eu

RCLONE_IMAGE=docker.io/rclone/rclone:1.75.1
BUCKETS="files private"
RETAIN_DAYS=30

die() { printf 'backup: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

dry_run=
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
  shift
fi

# Every command that changes the backup or the store goes through this.
run() {
  if [ -n "$dry_run" ]; then
    printf '+ %s\n' "$*"
  else
    "$@"
  fi
}

[ -f .env ] || die "no .env here; run this in the deployment's directory"

# The last assignment wins, as it does for compose; surrounding quotes are dropped.
env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# podman-compose 1.0.6 names the project after the directory, lower-cased and
# stripped of everything but letters, digits, `-` and `_`; its network
# `<project>_default` and each service's container `<project>_<service>_1`.
# shellcheck disable=SC2018,SC2019 # only ASCII letters survive the sed anyway
project=${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr 'A-Z' 'a-z' | sed 's/[^-_a-z0-9]//g')}

backup_dir=$(env_value HUMANDBS_BACKUP_DIR)
[ -n "$backup_dir" ] || die "HUMANDBS_BACKUP_DIR is not set in .env"
# shellcheck disable=SC2088 # a literal `~/` from .env is what is matched
case $backup_dir in "~/"*) backup_dir="$HOME/${backup_dir#"~/"}" ;; esac
files_dir="$backup_dir/files"

# One run at a time: a second backup would sync into the same directories, and
# a restore would read what a backup is rewriting. podman is always run with
# the lock's descriptor closed, else a process it leaves behind (conmon, the
# network's DNS server) would hold the lock after this script has ended.
lock() {
  [ -z "$dry_run" ] || return 0
  mkdir -p "$backup_dir"
  exec 9>"$backup_dir/.lock"
  flock -n 9 || die "another scripts/backup.sh is running on $backup_dir"
}

# The keys are handed over by name, so that their values come from this
# process's environment: a command line is visible to every user of the host.
RCLONE_CONFIG_STORE_ACCESS_KEY_ID=$(env_value HUMANDBS_S3_ACCESS_KEY)
RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY=$(env_value HUMANDBS_S3_SECRET_KEY)
export RCLONE_CONFIG_STORE_ACCESS_KEY_ID RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY

# rclone with the store as `store:` and files/ as /backup. The first argument
# is the mount's options. `--metadata` keeps each object's Content-Type as an
# extended attribute of its file and sets it again when the file is copied back.
rclone() {
  mount_options=$1
  shift
  run podman run --rm --network "${project}_default" \
    -e RCLONE_CONFIG=/dev/null \
    -e RCLONE_CONFIG_STORE_TYPE=s3 \
    -e RCLONE_CONFIG_STORE_PROVIDER=SeaweedFS \
    -e "RCLONE_CONFIG_STORE_ENDPOINT=$(env_value HUMANDBS_S3_ENDPOINT)" \
    -e RCLONE_CONFIG_STORE_ACCESS_KEY_ID \
    -e RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY \
    -v "$files_dir:/backup$mount_options" \
    "$RCLONE_IMAGE" --metadata "$@" 9>&-
}

# Removes the entries of a directory whose names begin with a date before the
# cutoff. Names that do not begin with a date are left alone.
prune() {
  [ -d "$1" ] || return 0
  for entry in "$1"/*; do
    [ -e "$entry" ] || continue
    day=$(basename "$entry" | cut -c 1-8)
    case $day in
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
      *) continue ;;
    esac
    if [ "$day" -lt "$cutoff" ]; then
      run rm -rf "$entry"
    fi
  done
}

back_up() {
  podman container exists "${project}_db_1" || die "${project}_db_1 does not exist; this backs up a running deployment"
  lock
  today=$(date +%Y%m%d)
  cutoff=$(date -d "$RETAIN_DAYS days ago" +%Y%m%d)

  step "dump the database"
  dump="$backup_dir/db/$(date +%Y%m%d-%H%M%S).dump"
  if [ -n "$dry_run" ]; then
    printf '+ podman exec %s pg_dump -Fc ... > %s\n' "${project}_db_1" "$dump"
    printf '+ podman exec -i %s pg_restore --list < %s\n' "${project}_db_1" "$dump"
  else
    mkdir -p "$backup_dir/db"
    podman exec "${project}_db_1" pg_dump -Fc \
      -U "$(env_value HUMANDBS_POSTGRES_USER)" -d "$(env_value HUMANDBS_POSTGRES_DB)" \
      > "$dump.partial" 9>&-
    # Read back inside the database's container: the host's pg_restore may be
    # older than the pg_dump that wrote the archive.
    podman exec -i "${project}_db_1" pg_restore --list < "$dump.partial" > /dev/null 9>&- ||
      die "the dump cannot be read back: $dump.partial"
    mv "$dump.partial" "$dump"
    echo "$dump"
  fi

  step "copy .env"
  run mkdir -p "$backup_dir/env"
  run install -m 600 .env "$backup_dir/env/$today.env"

  for bucket in $BUCKETS; do
    step "copy the bucket $bucket"
    run mkdir -p "$files_dir/current/$bucket"
    rclone "" sync --use-server-modtime \
      --backup-dir "/backup/deleted/$today/$bucket" \
      -v --stats 10m --stats-one-line \
      "store:$bucket" "/backup/current/$bucket"
  done

  step "remove what is older than $cutoff"
  prune "$backup_dir/db"
  prune "$backup_dir/env"
  prune "$files_dir/deleted"

  if [ -n "$dry_run" ]; then
    printf '+ date > %s\n' "$backup_dir/last-success"
  else
    date '+%Y-%m-%dT%H:%M:%S%z' > "$backup_dir/last-success"
  fi
  echo "backed up to $backup_dir"
}

restore_files() {
  usage="usage: scripts/backup.sh [--dry-run] restore-files current/<bucket>[/<key>] | deleted/<date>/<bucket>[/<key>]"
  path=${1:-}
  [ -n "$path" ] || die "$usage"
  case $path in /* | *//*) die "$path: not a path under $files_dir" ;; esac
  case /$path/ in */../* | */./*) die "$path: not a path under $files_dir" ;; esac
  case $path in
    current/*)
      rest=${path#current/}
      ;;
    deleted/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]/*)
      rest=${path#deleted/*/}
      ;;
    *) die "$usage" ;;
  esac
  bucket=${rest%%/*}
  key=
  case $rest in */*) key=${rest#*/} ;; esac
  case " $BUCKETS " in
    *" $bucket "*) ;;
    *) die "$path: no bucket \`$bucket\` (the buckets are $BUCKETS)" ;;
  esac
  [ -e "$files_dir/$path" ] || die "no $files_dir/$path"

  lock
  step "copy $path to $bucket/$key"
  if [ -d "$files_dir/$path" ]; then
    rclone ":ro" copy -v "/backup/$path" "store:$bucket/$key"
  else
    rclone ":ro" copyto -v "/backup/$path" "store:$bucket/$key"
  fi
}

case "${1:-}" in
  restore-files)
    restore_files "${2:-}"
    ;;
  "")
    back_up
    ;;
  *)
    die "usage: scripts/backup.sh [--dry-run] | scripts/backup.sh [--dry-run] restore-files <path>"
    ;;
esac
