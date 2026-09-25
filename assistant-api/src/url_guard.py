"""Guard against outbound requests reaching non-public network destinations (SSRF).

The assistant fetches URLs supplied indirectly by applicants and by web search
results. Its own network reaches the portal and nothing else internal - not
the object store, not the database - but a crafted document can still name
any address, so this module is what actually keeps a fetch off internal or
non-routable destinations rather than relying on network placement alone.
Every outbound fetch of such a URL must go through this module.

The core rule: resolve the target hostname to IP addresses exactly once, and
reject the URL unless every resolved address is globally routable. Checking a
hostname and then letting the HTTP client resolve it again for the actual
connection leaves a window where the two lookups can return different
addresses (DNS rebinding) - so callers must reuse the address this module
resolved rather than resolving the hostname a second time.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests
from requests.adapters import HTTPAdapter

ALLOWED_SCHEMES = frozenset({"http", "https"})
DEFAULT_PORTS: dict[str, int] = {"http": 80, "https": 443}
DEFAULT_MAX_REDIRECTS = 5
DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024  # 2 MB
_REDIRECT_STATUS_CODES = frozenset({301, 302, 303, 307, 308})

_FORBIDDEN_HOSTNAMES = frozenset({"localhost"})
_FORBIDDEN_HOSTNAME_SUFFIXES = (".local", ".internal", ".localhost")
_CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")


class UnsafeURLError(ValueError):
    """A URL failed outbound SSRF validation."""


@dataclass(frozen=True)
class ResolvedURL:
    """A URL whose hostname has been resolved and validated exactly once."""

    url: str
    scheme: str
    hostname: str
    port: int
    addresses: tuple[str, ...]
    pinned_address: str
    family: socket.AddressFamily


def _is_ip_literal(hostname: str) -> bool:
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return False


def _looks_like_integer_literal(hostname: str) -> bool:
    """Reject hostnames such as ``2130706433`` or ``0x7f000001``.

    These are legacy numeric forms that some resolvers turn into an IP
    address (e.g. 127.0.0.1), bypassing hostname-shaped allow/deny lists.
    They are also caught after resolution because ``getaddrinfo`` normalizes
    them to a real address, but rejecting the shape up front avoids relying
    on resolver-specific parsing behavior.
    """
    stripped = hostname.strip()
    if not stripped:
        return False
    if stripped.isdigit():
        return True
    try:
        int(stripped, 0)
        return True
    except ValueError:
        return False


def validate_hostname_shape(hostname: str) -> None:
    """Reject hostnames that can never be a legitimate public Internet host."""
    if not hostname:
        raise UnsafeURLError("URL has no hostname")

    canonical = hostname.lower().rstrip(".")

    if canonical in _FORBIDDEN_HOSTNAMES:
        raise UnsafeURLError(f"Hostname is not allowed: {hostname}")
    if canonical.endswith(_FORBIDDEN_HOSTNAME_SUFFIXES):
        raise UnsafeURLError(f"Hostname is not allowed: {hostname}")
    if _looks_like_integer_literal(canonical):
        raise UnsafeURLError(f"Numeric IP literals are not allowed as a hostname: {hostname}")
    if "." not in canonical and ":" not in canonical and not _is_ip_literal(canonical):
        # Bare single-label names resolve through local search domains or
        # internal DNS, never through the public Internet.
        raise UnsafeURLError(f"Bare hostnames are not allowed: {hostname}")


def is_globally_routable(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Whether ``ip`` is a publicly routable Internet address.

    Rejects loopback, private, link-local, multicast, reserved, unspecified,
    and CGNAT (100.64.0.0/10) addresses, unwrapping IPv4-mapped IPv6
    addresses first so ``::ffff:127.0.0.1`` is rejected the same as
    ``127.0.0.1``.
    """
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped

    if (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False
    if isinstance(ip, ipaddress.IPv4Address) and ip in _CGNAT_NETWORK:
        return False
    return bool(ip.is_global)


def _resolve_and_validate_addresses(hostname: str, port: int) -> list[tuple[socket.AddressFamily, str]]:
    """Resolve ``hostname`` once and confirm every resolved address is public."""
    validate_hostname_shape(hostname)

    if _is_ip_literal(hostname):
        # No lookup needed - and none should be attempted, since a resolver
        # could still map a canonical IP literal onto something else.
        ip = ipaddress.ip_address(hostname)
        family = socket.AF_INET6 if ip.version == 6 else socket.AF_INET
        resolved = [(family, str(ip))]
    else:
        try:
            addr_infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            raise UnsafeURLError(f"Could not resolve hostname: {hostname}") from exc

        resolved = []
        seen: set[str] = set()
        for family, _socktype, _proto, _canonname, sockaddr in addr_infos:
            ip_str = sockaddr[0]
            if ip_str in seen:
                continue
            seen.add(ip_str)
            resolved.append((family, ip_str))

    if not resolved:
        raise UnsafeURLError(f"Hostname did not resolve to any address: {hostname}")

    for _family, ip_str in resolved:
        if not is_globally_routable(ipaddress.ip_address(ip_str)):
            raise UnsafeURLError(f"Resolved address is not publicly routable: {ip_str} (host {hostname})")

    return resolved


def validate_public_url(url: str) -> ResolvedURL:
    """Validate ``url`` and resolve it to a single pinned public address.

    Raises :class:`UnsafeURLError` if the URL is not a plain ``http``/``https``
    URL, has userinfo, has a hostname that cannot be a public Internet
    host, or resolves (even partially) to a non-public address.
    """
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UnsafeURLError(f"URL scheme is not allowed: {parsed.scheme or url!r}")
    if parsed.username or parsed.password:
        raise UnsafeURLError("URLs with embedded credentials are not allowed")

    hostname = (parsed.hostname or "").lower()
    port = parsed.port or DEFAULT_PORTS[scheme]

    resolved = _resolve_and_validate_addresses(hostname, port)
    pinned_family, pinned_address = resolved[0]

    return ResolvedURL(
        url=url,
        scheme=scheme,
        hostname=hostname,
        port=port,
        addresses=tuple(ip for _family, ip in resolved),
        pinned_address=pinned_address,
        family=pinned_family,
    )


async def validate_public_url_async(url: str) -> ResolvedURL:
    return await asyncio.to_thread(validate_public_url, url)


class PinnedHTTPAdapter(HTTPAdapter):
    """A ``requests`` adapter that connects to a pre-validated address.

    Connecting to the address this module already validated - instead of
    letting the connection pool resolve the hostname again - closes the
    DNS-rebinding window between validation and connection. The ``Host``
    header and, for HTTPS, the TLS server name / certificate hostname check
    still use the original hostname so the request looks the same to the
    server and certificate verification is unaffected.
    """

    def __init__(self, resolved: ResolvedURL, *args, **kwargs) -> None:
        self._resolved = resolved
        super().__init__(*args, **kwargs)

    def get_connection_with_tls_context(self, request, verify, proxies=None, cert=None):
        host_params, pool_kwargs = self.build_connection_pool_key_attributes(request, verify, cert)
        host_params["host"] = self._resolved.pinned_address
        host_params["port"] = self._resolved.port

        if request.url.lower().startswith("https"):
            pool_kwargs = dict(pool_kwargs)
            pool_kwargs["server_hostname"] = self._resolved.hostname
            pool_kwargs["assert_hostname"] = self._resolved.hostname

        conn = self.poolmanager.connection_from_host(**host_params, pool_kwargs=pool_kwargs)

        default_port = DEFAULT_PORTS.get(self._resolved.scheme)
        request.headers["Host"] = (
            self._resolved.hostname
            if self._resolved.port == default_port
            else f"{self._resolved.hostname}:{self._resolved.port}"
        )
        return conn


def open_pinned_response(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float | tuple[float, float] = DEFAULT_TIMEOUT_SECONDS,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
) -> requests.Response:
    """GET ``url`` while validating and pinning every redirect hop.

    Each hop is validated with :func:`validate_public_url` and fetched with
    ``allow_redirects=False`` so redirects are inspected one at a time
    instead of being followed automatically. The returned response is the
    first non-redirect response; the caller is responsible for closing it.
    """
    current_url = url
    for _ in range(max_redirects + 1):
        resolved = validate_public_url(current_url)

        session = requests.Session()
        adapter = PinnedHTTPAdapter(resolved)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        response = session.get(
            current_url,
            headers=headers,
            timeout=timeout,
            allow_redirects=False,
            stream=True,
        )

        if response.status_code in _REDIRECT_STATUS_CODES:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise UnsafeURLError(f"Redirect response from {current_url} is missing a Location header")
            current_url = urljoin(current_url, location)
            continue

        return response

    raise UnsafeURLError(f"Too many redirects while fetching {url}")


def read_response_with_limit(response: requests.Response, max_bytes: int = DEFAULT_MAX_RESPONSE_BYTES) -> bytes:
    """Read ``response`` body, aborting once more than ``max_bytes`` have arrived."""
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=65536):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            response.close()
            raise UnsafeURLError(f"Response body exceeded the maximum allowed size of {max_bytes} bytes")
        chunks.append(chunk)
    return b"".join(chunks)


class GuardedResolver:
    """An ``aiohttp`` resolver that validates every address before returning it.

    aiohttp connects to exactly the address a resolver returns, so validating
    inside the resolver (rather than before creating the request) removes the
    gap between checking a host and connecting to it. This does not by itself
    protect requests to bare IP-literal URLs, since aiohttp resolves those
    without consulting the configured resolver; callers must still validate
    the URL up front with :func:`validate_public_url` before making the
    request.
    """

    async def resolve(self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_UNSPEC) -> list[dict]:
        try:
            resolved = await asyncio.to_thread(_resolve_and_validate_addresses, host, port)
        except UnsafeURLError as exc:
            raise OSError(f"DNS lookup blocked for {host}: {exc}") from exc

        if family not in (0, socket.AF_UNSPEC):
            filtered = [entry for entry in resolved if entry[0] == family]
            if filtered:
                resolved = filtered

        return [
            {
                "hostname": host,
                "host": ip_str,
                "port": port,
                "family": entry_family,
                "proto": 0,
                "flags": 0,
            }
            for entry_family, ip_str in resolved
        ]

    async def close(self) -> None:
        return None


# file:/ws:/wss: are never needed to fetch a web page or PDF, so they are
# blocked unconditionally rather than only for navigations.
_ALWAYS_BLOCKED_SCHEMES = frozenset({"file", "ws", "wss"})


async def ssrf_route_guard(route: object) -> None:
    """A Playwright ``context.route`` handler that blocks non-public requests.

    Applied to every request Chromium makes for a fetched page (navigations,
    redirects, iframes, and subresources) so none of them can reach an
    internal address, independent of the top-level URL check done before
    navigation starts.

    Residual risk: Chromium resolves DNS itself when it actually opens the
    connection, after this handler has already approved the request. A
    hostname that resolves to a public address here but to an internal
    address a moment later (DNS rebinding) would pass this check and still
    be dialed by Chromium. The top-level navigation host is pinned at browser
    launch time via ``--host-resolver-rules`` to remove this window for that
    one host; other hosts reached during the page load (redirects to a
    different host, iframes, subresources) are not pinned and rely on this
    per-request check alone.
    """
    request = route.request
    url = request.url
    scheme = urlparse(url).scheme.lower()
    is_navigation = bool(request.is_navigation_request())

    if scheme == "data":
        if is_navigation:
            await route.abort()
            return
        # Decoded locally by the browser; never reaches the network.
        await route.continue_()
        return

    if scheme in _ALWAYS_BLOCKED_SCHEMES or scheme not in ALLOWED_SCHEMES:
        await route.abort()
        return

    try:
        await validate_public_url_async(url)
    except UnsafeURLError:
        await route.abort()
        return

    await route.continue_()
