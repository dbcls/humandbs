#!/bin/sh
# Defines `$public_host` for default.conf: the host of HUMANDBS_AUTH_REDIRECT_URI,
# with its port unless that is the scheme's default, written exactly as the
# application's `new URL(...).host` writes it. The proxy hands this to the
# application and the object store in place of the Host that arrived, so that a
# form's `Origin` and a presigned URL's signature are checked against the address
# a browser uses, whatever a proxy in front did to the Host header.
#
# **A value that cannot be written the same way here is refused, and nginx does
# not start.** A host that differs from the application's by a single character
# refuses every write and every signed URL, and would be found only then. What is
# accepted is a DNS name whose last label begins with a letter, or an IPv4
# address in dotted-decimal form, either with an optional port.
#
# The file to write is the first argument; without one, it is where nginx reads
# its configuration from.
set -eu

conf=${1:-/etc/nginx/conf.d/public-host.conf}
uri=${HUMANDBS_AUTH_REDIRECT_URI:-}

refuse() {
  echo "$0: HUMANDBS_AUTH_REDIRECT_URI $1" >&2
  exit 1
}

lower() {
  printf '%s' "$1" | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz'
}

case $uri in
  *[[:space:]]* | *[[:cntrl:]]*) refuse "must not contain whitespace or control characters" ;;
  *://*) ;;
  *) refuse "must be an http or https URL" ;;
esac

scheme=$(lower "${uri%%://*}")
rest=${uri#*://}
authority=$(lower "${rest%%[/?#]*}")

case $scheme in
  http) default_port=80 ;;
  https) default_port=443 ;;
  *) refuse "must be an http or https URL" ;;
esac

case $authority in
  *:*) host=${authority%:*} port=${authority##*:} ;;
  *) host=$authority port= ;;
esac

label='[a-z0-9-]+'
octet='(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
if ! printf '%s\n' "$host" | grep -Eqx "(${label}\.)*[a-z][a-z0-9-]*|(${octet}\.){3}${octet}"; then
  refuse "must have a DNS name or an IPv4 address as its host"
fi

case $authority in
  *:*)
    case $port in
      '' | *[!0-9]*) refuse "must have a port of digits after a colon" ;;
    esac
    port=$(printf '%s\n' "$port" | sed 's/^0*\([0-9]\)/\1/')
    if [ ${#port} -gt 5 ] || [ "$port" -gt 65535 ]; then
      refuse "must have a port no greater than 65535"
    fi
    if [ "$port" = "$default_port" ]; then port=; fi
    ;;
esac

value=$host${port:+:$port}
printf 'map $host $public_host {\n  default "%s";\n}\n' "$value" > "$conf"
echo "$0: the proxy hands on ${value} as the host"
