import ipaddress
import socket

import pytest
import requests
from hypothesis import given
from hypothesis import strategies as st

from src import url_guard

# ---------------------------------------------------------------------------
# DNS stubbing helpers
# ---------------------------------------------------------------------------


def _sockaddr(family: socket.AddressFamily, ip: str, port: int) -> tuple:
    if family == socket.AF_INET6:
        return (ip, port, 0, 0)
    return (ip, port)


def _addrinfo_entries(ips: list[str], port: int) -> list[tuple]:
    entries = []
    for ip in ips:
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        entries.append((family, socket.SOCK_STREAM, 6, "", _sockaddr(family, ip, port)))
    return entries


def _install_fake_dns(monkeypatch, mapping: dict[str, list[str]]) -> list[str]:
    """Monkeypatch socket.getaddrinfo, returning the list of hostnames looked up (in order)."""
    calls: list[str] = []

    def fake_getaddrinfo(host, port, *args, **kwargs):
        calls.append(host)
        if host not in mapping:
            raise socket.gaierror(f"no such host: {host}")
        return _addrinfo_entries(mapping[host], port)

    monkeypatch.setattr(url_guard.socket, "getaddrinfo", fake_getaddrinfo)
    return calls


# ---------------------------------------------------------------------------
# is_globally_routable / boundary addresses
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.0.5",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "100.127.255.255",
        "0.0.0.0",
        "::1",
        "fe80::1",
        "::ffff:127.0.0.1",
    ],
)
def test_is_globally_routable_rejects_non_public_address(ip: str) -> None:
    assert url_guard.is_globally_routable(ipaddress.ip_address(ip)) is False


@pytest.mark.parametrize("ip", ["93.184.216.34", "8.8.8.8", "::ffff:93.184.216.34"])
def test_is_globally_routable_accepts_public_address(ip: str) -> None:
    assert url_guard.is_globally_routable(ipaddress.ip_address(ip)) is True


@given(st.ip_addresses(v=4, network="10.0.0.0/8"))
def test_is_globally_routable_rejects_all_of_10_slash_8(ip) -> None:
    assert url_guard.is_globally_routable(ip) is False


@given(st.ip_addresses(v=4, network="172.16.0.0/12"))
def test_is_globally_routable_rejects_all_of_172_16_slash_12(ip) -> None:
    assert url_guard.is_globally_routable(ip) is False


@given(st.ip_addresses(v=4, network="192.168.0.0/16"))
def test_is_globally_routable_rejects_all_of_192_168_slash_16(ip) -> None:
    assert url_guard.is_globally_routable(ip) is False


@given(st.ip_addresses(v=4, network="127.0.0.0/8"))
def test_is_globally_routable_rejects_all_of_loopback_slash_8(ip) -> None:
    assert url_guard.is_globally_routable(ip) is False


@given(st.ip_addresses(v=4, network="100.64.0.0/10"))
def test_is_globally_routable_rejects_all_of_cgnat_range(ip) -> None:
    assert url_guard.is_globally_routable(ip) is False


@given(st.ip_addresses(v=6, network="fc00::/7"))
def test_is_globally_routable_rejects_all_of_ipv6_unique_local_range(ip) -> None:
    assert url_guard.is_globally_routable(ip) is False


# ---------------------------------------------------------------------------
# validate_public_url: scheme / userinfo / hostname shape
# ---------------------------------------------------------------------------


def test_validate_public_url_rejects_non_http_scheme() -> None:
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("file:///etc/passwd")


def test_validate_public_url_rejects_ftp_scheme() -> None:
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("ftp://example.com/file")


def test_validate_public_url_rejects_embedded_userinfo(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"host": ["93.184.216.34"]})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://user@host/")


@pytest.mark.parametrize("url", ["http://localhost/", "http://db/", "http://s3/"])
def test_validate_public_url_rejects_bare_or_forbidden_hostname_without_dns(monkeypatch, url: str) -> None:
    calls = _install_fake_dns(monkeypatch, {})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url(url)
    # Bare/forbidden hostnames are rejected by shape alone, before any lookup.
    assert calls == []


def test_validate_public_url_rejects_internal_service_name_that_resolves_privately(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"s3": ["10.0.0.5"], "db": ["10.0.0.6"]})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://s3:8888/")
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://db/")


@pytest.mark.parametrize("hostname", ["local.local", "server.internal", "printer.localhost"])
def test_validate_public_url_rejects_reserved_tld_suffixes(monkeypatch, hostname: str) -> None:
    calls = _install_fake_dns(monkeypatch, {hostname: ["93.184.216.34"]})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url(f"http://{hostname}/")
    assert calls == []


@pytest.mark.parametrize("url", ["http://2130706433/", "http://0x7f000001/", "http://017700000001/"])
def test_validate_public_url_rejects_numeric_ip_literal_hostnames(monkeypatch, url: str) -> None:
    calls = _install_fake_dns(monkeypatch, {})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url(url)
    # Rejected by shape before any DNS lookup is attempted.
    assert calls == []


def test_validate_public_url_rejects_legacy_dotted_hex_ip_literal_via_resolution(monkeypatch) -> None:
    # "0x7f.1" is not caught by the hostname-shape check (it isn't a bare
    # integer literal), so this proves the post-resolution address check is
    # the safety net for odd literal forms libc's resolver still accepts.
    _install_fake_dns(monkeypatch, {"0x7f.1": ["127.0.0.1"]})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://0x7f.1/")


# ---------------------------------------------------------------------------
# validate_public_url: resolution-based checks
# ---------------------------------------------------------------------------


def test_validate_public_url_accepts_public_ip_literal(monkeypatch) -> None:
    calls = _install_fake_dns(monkeypatch, {})
    resolved = url_guard.validate_public_url("http://93.184.216.34/path")
    assert resolved.pinned_address == "93.184.216.34"
    assert resolved.hostname == "93.184.216.34"
    # An IP literal needs no DNS lookup.
    assert calls == []


def test_validate_public_url_accepts_hostname_resolving_to_public_address(monkeypatch) -> None:
    calls = _install_fake_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    resolved = url_guard.validate_public_url("https://example.com/path")
    assert resolved.pinned_address == "93.184.216.34"
    assert resolved.port == 443
    assert calls == ["example.com"]


def test_validate_public_url_resolves_hostname_exactly_once(monkeypatch) -> None:
    calls = _install_fake_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    url_guard.validate_public_url("https://example.com/path")
    assert len(calls) == 1


def test_validate_public_url_rejects_hostname_resolving_to_mixed_public_and_private(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"mixed.example": ["93.184.216.34", "10.0.0.1"]})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://mixed.example/")


def test_validate_public_url_rejects_ipv6_mapped_loopback(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"sneaky.example": ["::ffff:127.0.0.1"]})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://sneaky.example/")


def test_validate_public_url_rejects_when_dns_lookup_fails(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {})
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.validate_public_url("http://does-not-resolve.example/")


async def test_validate_public_url_async_matches_sync_result(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    resolved = await url_guard.validate_public_url_async("https://example.com/")
    assert resolved.pinned_address == "93.184.216.34"


# ---------------------------------------------------------------------------
# open_pinned_response: transport-boundary stubbing
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status_code: int, headers: dict[str, str] | None = None, content: bytes = b"") -> None:
        self.status_code = status_code
        self.headers = headers or {}
        self.content = content
        self.closed = False

    @property
    def is_redirect(self) -> bool:
        return self.status_code in (301, 302, 303, 307, 308) and "Location" in self.headers

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"status {self.status_code}")

    def iter_content(self, chunk_size: int = 65536):
        for i in range(0, len(self.content), chunk_size):
            yield self.content[i : i + chunk_size]

    def close(self) -> None:
        self.closed = True


def _install_fake_transport(monkeypatch, responses_by_call):
    """Stub requests.Session.get; records the pinned IP used for each call."""
    pinned_addresses: list[str] = []

    def fake_get(self, url, **kwargs):
        adapter = self.get_adapter(url)
        pinned_addresses.append(adapter._resolved.pinned_address)
        return responses_by_call.pop(0)

    monkeypatch.setattr(requests.Session, "get", fake_get)
    return pinned_addresses


def test_open_pinned_response_returns_first_non_redirect_response(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    pinned = _install_fake_transport(monkeypatch, [_FakeResponse(200, content=b"hello")])

    response = url_guard.open_pinned_response("https://example.com/file.pdf")

    assert response.status_code == 200
    assert pinned == ["93.184.216.34"]


def test_open_pinned_response_follows_redirect_to_public_host(monkeypatch) -> None:
    calls = _install_fake_dns(
        monkeypatch, {"a.example": ["93.184.216.34"], "b.example": ["93.184.216.35"]}
    )
    pinned = _install_fake_transport(
        monkeypatch,
        [
            _FakeResponse(302, headers={"Location": "https://b.example/final"}),
            _FakeResponse(200, content=b"final content"),
        ],
    )

    response = url_guard.open_pinned_response("https://a.example/start")

    assert response.status_code == 200
    assert calls == ["a.example", "b.example"]
    assert pinned == ["93.184.216.34", "93.184.216.35"]


def test_open_pinned_response_rejects_redirect_to_internal_host(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"a.example": ["93.184.216.34"], "internal.example": ["10.0.0.5"]})
    _install_fake_transport(
        monkeypatch,
        [_FakeResponse(302, headers={"Location": "https://internal.example/secret"})],
    )

    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.open_pinned_response("https://a.example/start")


def test_open_pinned_response_rejects_redirect_without_location(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"a.example": ["93.184.216.34"]})
    _install_fake_transport(monkeypatch, [_FakeResponse(302, headers={})])

    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.open_pinned_response("https://a.example/start")


def test_open_pinned_response_rejects_too_many_redirects(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"a.example": ["93.184.216.34"]})
    responses = [_FakeResponse(302, headers={"Location": "https://a.example/next"}) for _ in range(10)]
    _install_fake_transport(monkeypatch, responses)

    with pytest.raises(url_guard.UnsafeURLError, match="Too many redirects"):
        url_guard.open_pinned_response("https://a.example/start", max_redirects=5)


def test_open_pinned_response_uses_pinned_address_without_a_second_resolution(monkeypatch) -> None:
    # If the hostname were resolved again after validation, this second
    # lookup would return a private address and the pin would be wrong.
    lookups = {"count": 0}

    def fake_getaddrinfo(host, port, *args, **kwargs):
        lookups["count"] += 1
        ip = "93.184.216.34" if lookups["count"] == 1 else "10.0.0.1"
        return _addrinfo_entries([ip], port)

    monkeypatch.setattr(url_guard.socket, "getaddrinfo", fake_getaddrinfo)
    pinned = _install_fake_transport(monkeypatch, [_FakeResponse(200, content=b"ok")])

    url_guard.open_pinned_response("https://example.com/file.pdf")

    assert lookups["count"] == 1
    assert pinned == ["93.184.216.34"]


# ---------------------------------------------------------------------------
# read_response_with_limit
# ---------------------------------------------------------------------------


def test_read_response_with_limit_returns_body_within_limit() -> None:
    response = _FakeResponse(200, content=b"x" * 100)
    assert url_guard.read_response_with_limit(response, max_bytes=1000) == b"x" * 100


def test_read_response_with_limit_rejects_body_over_limit() -> None:
    response = _FakeResponse(200, content=b"x" * 100)
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.read_response_with_limit(response, max_bytes=10)
    assert response.closed is True


# ---------------------------------------------------------------------------
# GuardedResolver (aiohttp)
# ---------------------------------------------------------------------------


async def test_guarded_resolver_returns_records_for_public_address(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    resolver = url_guard.GuardedResolver()

    records = await resolver.resolve("example.com", 443, family=socket.AF_INET)

    assert records == [
        {
            "hostname": "example.com",
            "host": "93.184.216.34",
            "port": 443,
            "family": socket.AF_INET,
            "proto": 0,
            "flags": 0,
        }
    ]


async def test_guarded_resolver_raises_oserror_for_private_address(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"internal.example": ["10.0.0.5"]})
    resolver = url_guard.GuardedResolver()

    with pytest.raises(OSError):
        await resolver.resolve("internal.example", 80)


async def test_guarded_resolver_raises_oserror_for_bare_service_name(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"db": ["10.0.0.6"]})
    resolver = url_guard.GuardedResolver()

    with pytest.raises(OSError):
        await resolver.resolve("db", 5432)


# ---------------------------------------------------------------------------
# ssrf_route_guard (Playwright route handler, tested with fakes)
# ---------------------------------------------------------------------------


class _FakeRequest:
    def __init__(self, url: str, navigation: bool = False) -> None:
        self.url = url
        self._navigation = navigation

    def is_navigation_request(self) -> bool:
        return self._navigation


class _FakeRoute:
    def __init__(self, request: _FakeRequest) -> None:
        self.request = request
        self.aborted = False
        self.continued = False

    async def abort(self) -> None:
        self.aborted = True

    async def continue_(self) -> None:
        self.continued = True


async def test_ssrf_route_guard_continues_public_https_request(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    route = _FakeRoute(_FakeRequest("https://example.com/page"))

    await url_guard.ssrf_route_guard(route)

    assert route.continued is True
    assert route.aborted is False


async def test_ssrf_route_guard_aborts_request_to_private_address(monkeypatch) -> None:
    _install_fake_dns(monkeypatch, {"internal.example": ["10.0.0.5"]})
    route = _FakeRoute(_FakeRequest("http://internal.example/page"))

    await url_guard.ssrf_route_guard(route)

    assert route.aborted is True
    assert route.continued is False


@pytest.mark.parametrize("scheme", ["file", "ws", "wss"])
async def test_ssrf_route_guard_aborts_disallowed_schemes(scheme: str) -> None:
    route = _FakeRoute(_FakeRequest(f"{scheme}://internal/resource"))
    await url_guard.ssrf_route_guard(route)

    assert route.aborted is True


async def test_ssrf_route_guard_aborts_data_navigation() -> None:
    route = _FakeRoute(_FakeRequest("data:text/html,<h1>hi</h1>", navigation=True))
    await url_guard.ssrf_route_guard(route)

    assert route.aborted is True


async def test_ssrf_route_guard_allows_data_subresource() -> None:
    route = _FakeRoute(_FakeRequest("data:image/png;base64,AAAA", navigation=False))
    await url_guard.ssrf_route_guard(route)

    assert route.continued is True


async def test_ssrf_route_guard_aborts_unknown_scheme() -> None:
    route = _FakeRoute(_FakeRequest("chrome-extension://abc/page"))
    await url_guard.ssrf_route_guard(route)

    assert route.aborted is True
