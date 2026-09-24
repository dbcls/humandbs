#!/bin/sh
# Updates a rootless-podman deployment to the sources in this directory, or
# puts back the images of an earlier one.
#
#   scripts/deploy.sh [tag]          build, back up, migrate, swap app + proxy
#   scripts/deploy.sh rollback <tag> swap app + proxy back to the images of <tag>
#
# Run in the deployment's directory, as the user that runs it. The tag names
# the images kept for a rollback; it defaults to the checked-out commit.
#
# **Nothing is stopped until the new images are built and the migrations have
# run.** The served application keeps answering throughout, which is why a
# migration has to leave the schema usable by the release before it. What goes
# down is app and proxy, for the few seconds it takes to replace them; the
# database and the file store stay up.
set -eu

die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

[ -f .env ] || die "no .env here; run this in the deployment's directory"
[ -e compose.override.yml ] || die "compose.override.yml is missing (ln -s compose.deploy.yml compose.override.yml)"

# The last assignment wins, as it does for compose; surrounding quotes are dropped.
env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# podman-compose 1.0.6 names the project after the directory, lower-cased and
# stripped of everything but letters, digits, `-` and `_`.
project=${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr 'A-Z' 'a-z' | sed 's/[^-_a-z0-9]//g')}
images="app proxy tools migrate"

# A one-off container (`podman-compose run`) — the file carry, say — holds the
# database and the store as dependencies. Recreating them under it would fail
# halfway, so a deploy waits for it.
refuse_while_running_one_offs() {
  running=$(podman ps --format '{{.Names}}' | grep "^${project}_.*_tmp" || true)
  [ -z "$running" ] || die "one-off containers are running, wait for them: $running"
}

swap() {
  step "swap app and proxy"
  # The proxy first, so that nothing new reaches the application while it
  # stops. The application closes its listener on SIGTERM but keeps its timers,
  # so the grace period is what ends it.
  if podman container exists "${project}_proxy_1"; then
    podman stop -t 10 "${project}_proxy_1" >/dev/null
    podman rm "${project}_proxy_1" >/dev/null
  fi
  if podman container exists "${project}_app_1"; then
    podman stop -t 2 "${project}_app_1" >/dev/null
    podman rm "${project}_app_1" >/dev/null
  fi
  podman-compose up -d app proxy

  step "wait for /healthz"
  port=$(env_value HUMANDBS_PUBLIC_PORT)
  i=0
  until curl -fsS -o /dev/null "http://127.0.0.1:${port:-8080}/healthz"; do
    i=$((i + 1))
    [ "$i" -lt 60 ] || die "/healthz did not answer 200 within a minute"
    sleep 1
  done
  echo "serving"
}

case "${1:-}" in
  rollback)
    tag=${2:-}
    [ -n "$tag" ] || die "usage: scripts/deploy.sh rollback <tag>"
    refuse_while_running_one_offs
    for image in $images; do
      podman image exists "${project}_${image}:${tag}" || die "no image ${project}_${image}:${tag}"
    done
    step "retag $tag as latest"
    for image in $images; do
      podman tag "${project}_${image}:${tag}" "${project}_${image}:latest"
    done
    swap
    echo "rolled back to $tag. If the schema is no longer usable by it, restore the backup taken before the deploy (docs/deployment.md)."
    ;;
  -*)
    die "usage: scripts/deploy.sh [tag] | scripts/deploy.sh rollback <tag>"
    ;;
  *)
    tag=${1:-$(git rev-parse --short HEAD 2>/dev/null || true)}
    [ -n "$tag" ] || die "not a git checkout; give the tag: scripts/deploy.sh <tag>"
    refuse_while_running_one_offs

    step "build ($tag)"
    podman-compose build $images
    for image in $images; do
      podman tag "${project}_${image}:latest" "${project}_${image}:${tag}"
    done

    step "back up the database"
    data_dir=$(env_value HUMANDBS_DATA_DIR)
    [ -n "$data_dir" ] || die "HUMANDBS_DATA_DIR is not set in .env"
    case $data_dir in "~/"*) data_dir="$HOME/${data_dir#"~/"}" ;; esac
    mkdir -p "$data_dir/backup"
    backup="$data_dir/backup/$(date +%Y%m%d-%H%M%S)-before-${tag}.dump"
    podman exec "${project}_db_1" pg_dump -Fc \
      -U "$(env_value HUMANDBS_POSTGRES_USER)" -d "$(env_value HUMANDBS_POSTGRES_DB)" \
      > "$backup.partial"
    mv "$backup.partial" "$backup"
    echo "$backup"

    step "migrate"
    podman-compose run --rm -T migrate

    swap
    echo "deployed $tag"
    ;;
esac
