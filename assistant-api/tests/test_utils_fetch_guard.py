import logging
import socket

import pytest

from src import url_guard, utils

_logger = logging.getLogger("test_utils_fetch_guard")


def _fake_resolved(url: str, hostname: str = "example.com", pinned_address: str = "93.184.216.34") -> url_guard.ResolvedURL:
    return url_guard.ResolvedURL(
        url=url,
        scheme="https",
        hostname=hostname,
        port=443,
        addresses=(pinned_address,),
        pinned_address=pinned_address,
        family=socket.AF_INET,
    )


# ---------------------------------------------------------------------------
# Top-level URL is always validated first, before touching requests or Playwright
# ---------------------------------------------------------------------------


async def test_fetch_with_playwright_impl_returns_none_for_unsafe_url(monkeypatch) -> None:
    async def reject(_url):
        raise url_guard.UnsafeURLError("not a public address")

    monkeypatch.setattr(url_guard, "validate_public_url_async", reject)

    def unexpected_playwright():
        raise AssertionError("Playwright must not start for a rejected URL")

    monkeypatch.setattr(utils, "async_playwright", unexpected_playwright)

    result = await utils._fetch_with_playwright_impl("http://169.254.169.254/latest/meta-data", True, _logger)

    assert result is None


async def test_fetch_with_playwright_impl_returns_none_for_unsafe_pdf_url(monkeypatch) -> None:
    async def reject(_url):
        raise url_guard.UnsafeURLError("internal service")

    monkeypatch.setattr(url_guard, "validate_public_url_async", reject)

    def unexpected_fetch(*_args, **_kwargs):
        raise AssertionError("The PDF should never be fetched for a rejected URL")

    monkeypatch.setattr(url_guard, "open_pinned_response", unexpected_fetch)

    result = await utils._fetch_with_playwright_impl("http://s3:8888/private-bucket/doc.pdf", True, _logger)

    assert result is None


# ---------------------------------------------------------------------------
# PDF branch: fetched through the pinned/redirect-validated path with a size cap
# ---------------------------------------------------------------------------


class _FakePdfResponse:
    def __init__(self) -> None:
        self.closed = False

    def raise_for_status(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True


async def test_fetch_with_playwright_impl_pdf_uses_pinned_fetch_with_size_cap(monkeypatch) -> None:
    url = "https://example.com/document.pdf"

    async def validate(u):
        assert u == url
        return _fake_resolved(u)

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    fake_response = _FakePdfResponse()
    captured = {}

    def fake_open_pinned_response(u, *, headers=None, timeout=None):
        captured["url"] = u
        captured["timeout"] = timeout
        return fake_response

    def fake_read_with_limit(response, max_bytes):
        assert response is fake_response
        assert max_bytes == url_guard.DEFAULT_MAX_RESPONSE_BYTES
        return b"%PDF-1.4 minimal content"

    monkeypatch.setattr(url_guard, "open_pinned_response", fake_open_pinned_response)
    monkeypatch.setattr(url_guard, "read_response_with_limit", fake_read_with_limit)

    async def fake_extract_text_from_pdf(_path, _task_id):
        return "extracted markdown"

    monkeypatch.setattr(utils, "extract_text_from_pdf", fake_extract_text_from_pdf)

    result = await utils._fetch_with_playwright_impl(url, True, _logger)

    assert result == "extracted markdown"
    assert captured["url"] == url
    assert fake_response.closed is True


async def test_fetch_with_playwright_impl_pdf_returns_none_when_redirect_is_rejected(monkeypatch) -> None:
    url = "https://example.com/document.pdf"

    async def validate(u):
        return _fake_resolved(u)

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    def fake_open_pinned_response(*_args, **_kwargs):
        raise url_guard.UnsafeURLError("redirected to a non-public address")

    monkeypatch.setattr(url_guard, "open_pinned_response", fake_open_pinned_response)

    result = await utils._fetch_with_playwright_impl(url, True, _logger)

    assert result is None


async def test_fetch_with_playwright_impl_pdf_returns_none_when_body_exceeds_size_cap(monkeypatch) -> None:
    url = "https://example.com/document.pdf"

    async def validate(u):
        return _fake_resolved(u)

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    fake_response = _FakePdfResponse()
    monkeypatch.setattr(url_guard, "open_pinned_response", lambda *_a, **_k: fake_response)

    def fake_read_with_limit(_response, _max_bytes):
        raise url_guard.UnsafeURLError("response too large")

    monkeypatch.setattr(url_guard, "read_response_with_limit", fake_read_with_limit)

    result = await utils._fetch_with_playwright_impl(url, True, _logger)

    assert result is None
    assert fake_response.closed is True


# ---------------------------------------------------------------------------
# HTML branch: Chromium is launched with the pinned host-resolver rule, and the
# per-request route guard + service worker block are applied to the context.
# ---------------------------------------------------------------------------


class _FakePage:
    def __init__(self, content: str = "<html><body>hi</body></html>", text: str = "hi") -> None:
        self.goto_calls: list[tuple] = []
        self._content = content
        self._text = text

    async def goto(self, url, timeout=None, wait_until=None):
        self.goto_calls.append((url, timeout, wait_until))

    async def content(self):
        return self._content

    async def inner_text(self, selector):
        assert selector == "body"
        return self._text


class _FakeContext:
    def __init__(self, page: _FakePage) -> None:
        self._page = page
        self.route_calls: list[tuple] = []
        self.new_page_called = False

    async def route(self, pattern, handler):
        self.route_calls.append((pattern, handler))

    async def new_page(self):
        self.new_page_called = True
        return self._page


class _FakeBrowser:
    def __init__(self, context: _FakeContext) -> None:
        self._context = context
        self.new_context_kwargs: dict | None = None
        self.closed = False

    async def new_context(self, **kwargs):
        self.new_context_kwargs = kwargs
        return self._context

    async def close(self):
        self.closed = True


class _FakeChromium:
    def __init__(self, browser: _FakeBrowser) -> None:
        self._browser = browser
        self.launch_kwargs: dict | None = None

    async def launch(self, **kwargs):
        self.launch_kwargs = kwargs
        return self._browser


class _FakePlaywrightInstance:
    def __init__(self, chromium: _FakeChromium) -> None:
        self.chromium = chromium


class _FakePlaywrightCM:
    def __init__(self, instance: _FakePlaywrightInstance) -> None:
        self._instance = instance

    async def __aenter__(self):
        return self._instance

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.fixture
def fake_playwright_stack(monkeypatch):
    page = _FakePage()
    context = _FakeContext(page)
    browser = _FakeBrowser(context)
    chromium = _FakeChromium(browser)
    instance = _FakePlaywrightInstance(chromium)

    monkeypatch.setattr(utils, "async_playwright", lambda: _FakePlaywrightCM(instance))
    return page, context, browser, chromium


async def test_fetch_with_playwright_impl_html_pins_top_level_host_at_launch(monkeypatch, fake_playwright_stack) -> None:
    _page, _context, _browser, chromium = fake_playwright_stack
    url = "https://example.com/page"

    async def validate(u):
        return _fake_resolved(u, hostname="example.com", pinned_address="93.184.216.34")

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    await utils._fetch_with_playwright_impl(url, True, _logger)

    assert "--host-resolver-rules=MAP example.com 93.184.216.34" in chromium.launch_kwargs["args"]


async def test_fetch_with_playwright_impl_html_registers_ssrf_route_guard(monkeypatch, fake_playwright_stack) -> None:
    _page, context, _browser, _chromium = fake_playwright_stack
    url = "https://example.com/page"

    async def validate(u):
        return _fake_resolved(u)

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    await utils._fetch_with_playwright_impl(url, True, _logger)

    assert context.route_calls == [("**/*", url_guard.ssrf_route_guard)]


async def test_fetch_with_playwright_impl_html_blocks_service_workers(monkeypatch, fake_playwright_stack) -> None:
    _page, _context, browser, _chromium = fake_playwright_stack
    url = "https://example.com/page"

    async def validate(u):
        return _fake_resolved(u)

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    await utils._fetch_with_playwright_impl(url, True, _logger)

    assert browser.new_context_kwargs == {"service_workers": "block"}


async def test_fetch_with_playwright_impl_html_navigates_and_returns_markdown(monkeypatch, fake_playwright_stack) -> None:
    page, _context, _browser, _chromium = fake_playwright_stack
    url = "https://example.com/page"

    async def validate(u):
        return _fake_resolved(u)

    monkeypatch.setattr(url_guard, "validate_public_url_async", validate)

    result = await utils._fetch_with_playwright_impl(url, True, _logger)

    assert page.goto_calls[0][0] == url
    assert "hi" in result
