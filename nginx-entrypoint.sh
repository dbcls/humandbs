#!/bin/sh
set -eu

# nginx cannot read /etc/resolv.conf for its `resolver` directive, so pull the
# podman DNS (aardvark-dns) address from the container's resolv.conf and feed it
# to nginx.conf via envsubst. This lets nginx re-resolve the backend/frontend
# container IPs at request time instead of caching them from startup -- see the
# header comment in nginx.conf for why that matters under rootless podman.
NGINX_RESOLVER="$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)"
if [ -z "${NGINX_RESOLVER}" ]; then
  echo "nginx-entrypoint: no nameserver found in /etc/resolv.conf" >&2
  exit 1
fi
export NGINX_RESOLVER

envsubst '${NGINX_RESOLVER}' \
  < /etc/nginx/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Run the nginx worker as root so that bind-mounted files on lustre (owned by the
# host user that runs rootless podman) are readable. The default nginx worker is
# uid 101, which rootless podman maps to a subuid outside the file owner, and
# lustre rejects that access.
sed -i 's/^user  *nginx;/user root;/' /etc/nginx/nginx.conf

exec /docker-entrypoint.sh nginx -g 'daemon off;'
