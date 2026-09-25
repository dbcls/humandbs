#!/bin/sh
# Updates a rootless-podman deployment to the sources in this directory, or
# puts back the images of an earlier one.
#
#   scripts/deploy.sh [--dry-run] [tag]            build, back up, migrate, swap
#   scripts/deploy.sh [--dry-run] rollback <tag>   swap back to the images of <tag>
#
# Run in the deployment's directory, as the user that runs it. The tag names
# the images kept for a rollback; it defaults to the checked-out commit.
# `--dry-run` prints what would change the deployment instead of doing it; the
# checks that only read (images, containers) still run.
#
# **Nothing is stopped until the new images are built and the migrations have
# run.** The served application keeps answering throughout, which is why a
# migration has to leave the schema usable by the release before it. What then
# goes down is app and proxy, and — only when compose*.yml or .env changed —
# the database and the file store with them, all within one window that ends
# when /healthz answers again.
#
# Constraints of podman-compose 1.0.6 that shape the steps:
#  - `up` and `run` stop and remove every service they name, together with the
#    named services' dependencies, as soon as any container of the project was
#    made from a different definition (compose files and .env hash to one
#    label). So `up` is only ever called with app and proxy already gone, and
#    the migration is run without its dependencies, else it would take the
#    database away from the application still serving.
#  - `depends_on` conditions are ignored, so the wait for a healthy database
#    and store is done here.
set -eu

die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

dry_run=
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
  shift
fi

# Every command that changes the deployment goes through this.
run() {
  if [ -n "$dry_run" ]; then
    printf '+ %s\n' "$*"
  else
    "$@"
  fi
}

[ -f .env ] || die "no .env here; run this in the deployment's directory"
[ -e compose.override.yml ] || die "compose.override.yml is missing (ln -s compose.deploy.yml compose.override.yml)"

# The last assignment wins, as it does for compose; surrounding quotes are dropped.
env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# podman-compose 1.0.6 names the project after the directory, lower-cased and
# stripped of everything but letters, digits, `-` and `_`, and each service's
# container `<project>_<service>_1`.
# shellcheck disable=SC2018,SC2019 # only ASCII letters survive the sed anyway
project=${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr 'A-Z' 'a-z' | sed 's/[^-_a-z0-9]//g')}
images="app proxy tools migrate"
# The assistant runs only where it has been started, and is then built,
# tagged and rolled back together with the rest.
if podman container exists "${project}_assistant-api_1"; then
  images="$images assistant-api"
fi

# Any other container of the project would stop the swap from working: a
# one-off (`podman-compose run`) holds the database and the store as
# dependencies, so recreating them under it fails halfway; a leftover one made
# from an older definition makes every later `up` recreate the database and
# the store again. Both are refused before anything has changed.
refuse_other_containers() {
  others=$(podman ps -a --filter "label=io.podman.compose.project=${project}" --format '{{.Names}}' |
    grep -v -x -e "" -e "${project}_db_1" -e "${project}_s3_1" -e "${project}_app_1" \
      -e "${project}_proxy_1" -e "${project}_assistant-api_1" | tr '\n' ' ' || true)
  [ -z "$others" ] || die "other containers of ${project} exist; wait for the one-offs to finish and remove the rest: $others"
}

# Waits until the container's own healthcheck passes. Rootless podman may have
# no timer running the healthchecks, so they are run from here.
wait_healthy() {
  if [ -n "$dry_run" ]; then
    printf '+ wait until %s is healthy\n' "$1"
    return
  fi
  i=0
  until podman healthcheck run "$1" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 120 ] || die "$1 did not become healthy within two minutes"
    sleep 1
  done
}

# Where the proxy is published, as an address this host reaches it at.
healthz_url() {
  host=$(env_value HUMANDBS_PUBLIC_BIND_HOST)
  port=$(env_value HUMANDBS_PUBLIC_PORT)
  case $host in
    "" | 0.0.0.0) host=127.0.0.1 ;;
    "::" | "[::]") host="[::1]" ;;
    \[*) ;;
    *:*) host="[$host]" ;;
  esac
  echo "http://${host}:${port:-8080}/healthz"
}

swap() {
  # The proxy first, so that nothing new reaches the application while it
  # stops. The application closes its listener on SIGTERM but keeps its timers,
  # so the grace period is what ends it.
  step "stop proxy and app"
  if podman container exists "${project}_proxy_1"; then
    run podman stop -t 10 "${project}_proxy_1"
    run podman rm "${project}_proxy_1"
  fi
  if podman container exists "${project}_app_1"; then
    run podman stop -t 2 "${project}_app_1"
    run podman rm "${project}_app_1"
  fi

  # Recreates the database and the store if their definitions changed and
  # leaves them running otherwise; the data is in the volumes either way. The
  # assistant is named when it exists, so that no container of an older
  # definition is left for the next `up` to find.
  step "bring the database and the store up to their definitions"
  services="db s3"
  if podman container exists "${project}_assistant-api_1"; then
    services="$services assistant-api"
  fi
  # shellcheck disable=SC2086 # a list of service names
  run podman-compose up -d $services
  wait_healthy "${project}_db_1"
  wait_healthy "${project}_s3_1"

  step "start app and proxy"
  run podman-compose up -d app proxy

  url=$(healthz_url)
  step "wait for $url"
  if [ -n "$dry_run" ]; then
    printf '+ curl -fsS -o /dev/null %s\n' "$url"
    return
  fi
  i=0
  until curl -fsS -o /dev/null "$url"; do
    i=$((i + 1))
    [ "$i" -lt 60 ] || die "/healthz did not answer 200 within a minute"
    sleep 1
  done
  echo "serving"
}

case "${1:-}" in
  rollback)
    tag=${2:-}
    [ -n "$tag" ] || die "usage: scripts/deploy.sh [--dry-run] rollback <tag>"
    refuse_other_containers
    for image in $images; do
      podman image exists "${project}_${image}:${tag}" || die "no image ${project}_${image}:${tag}"
    done
    step "retag $tag as latest"
    for image in $images; do
      run podman tag "${project}_${image}:${tag}" "${project}_${image}:latest"
    done
    swap
    echo "rolled back to $tag. If the schema is no longer usable by it, restore the backup taken before the deploy (\$HUMANDBS_DATA_DIR/backup/*-before-<tag>.dump) with pg_restore."
    ;;
  -*)
    die "usage: scripts/deploy.sh [--dry-run] [tag] | scripts/deploy.sh [--dry-run] rollback <tag>"
    ;;
  *)
    tag=${1:-$(git rev-parse --short HEAD 2>/dev/null || true)}
    [ -n "$tag" ] || die "not a git checkout; give the tag: scripts/deploy.sh <tag>"
    refuse_other_containers
    podman container exists "${project}_db_1" || die "${project}_db_1 does not exist; this updates a running deployment"

    step "build ($tag)"
    # shellcheck disable=SC2086 # a list of service names
    run podman-compose build $images
    for image in $images; do
      run podman tag "${project}_${image}:latest" "${project}_${image}:${tag}"
    done

    step "back up the database"
    data_dir=$(env_value HUMANDBS_DATA_DIR)
    [ -n "$data_dir" ] || die "HUMANDBS_DATA_DIR is not set in .env"
    # shellcheck disable=SC2088 # a literal `~/` from .env is what is matched
    case $data_dir in "~/"*) data_dir="$HOME/${data_dir#"~/"}" ;; esac
    backup="$data_dir/backup/$(date +%Y%m%d-%H%M%S)-before-${tag}.dump"
    if [ -n "$dry_run" ]; then
      printf '+ podman exec %s pg_dump -Fc ... > %s\n' "${project}_db_1" "$backup"
    else
      mkdir -p "$data_dir/backup"
      podman exec "${project}_db_1" pg_dump -Fc \
        -U "$(env_value HUMANDBS_POSTGRES_USER)" -d "$(env_value HUMANDBS_POSTGRES_DB)" \
        > "$backup.partial"
      mv "$backup.partial" "$backup"
      echo "$backup"
    fi

    # Against the database as it runs now: with its dependencies, `run` would
    # bring them up and so recreate them under the application still serving.
    step "migrate"
    run podman-compose run --rm -T --no-deps migrate

    swap
    echo "deployed $tag"
    ;;
esac
