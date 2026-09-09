from unittest.mock import AsyncMock

import pytest

from src.services import email_check


@pytest.mark.parametrize(
    ("search_results", "expected_message"),
    [
        (None, "検索結果の取得に失敗しました"),
        ([], "example.edu を含むWebページが見つかりませんでした。検索結果: "),
    ],
)

@pytest.mark.parametrize("search_results", [None, []])
async def test_search_email_evidence_handles_no_results(monkeypatch, search_results) -> None:
    search = AsyncMock(return_value=search_results)
    fetch = AsyncMock()
    monkeypatch.setattr(email_check, "get_search_response", search)
    monkeypatch.setattr(email_check, "fetch_with_playwright", fetch)

    result = await email_check.search_email_evidence("researcher@example.edu")

    expected_message = (
        "Web検索結果の取得に失敗しました"
        if search_results is None
        else "researcher@example.edu に関連するWebページを見つけることができませんでした"
    )
    assert result == (False, None, expected_message)
    search.assert_awaited_once_with('"researcher@example.edu"', num_results=5, preferred_domain="example.edu")
    fetch.assert_not_awaited()


async def test_search_email_evidence_awaits_and_iterates_results(monkeypatch) -> None:
    evidence_url = "https://example.edu/researchers/one"
    search = AsyncMock(return_value=[None, {}, {"link": evidence_url}])
    fetch = AsyncMock(return_value="<p>Contact: researcher [at] example.edu</p>")
    monkeypatch.setattr(email_check, "get_search_response", search)
    monkeypatch.setattr(email_check, "fetch_with_playwright", fetch)

    result = await email_check.search_email_evidence("researcher@example.edu")

    assert result == (
        True,
        f"{evidence_url}#:~:text=researcher",
        "メールアドレスの記載されているWebページ",
    )
    search.assert_awaited_once_with('"researcher@example.edu"', num_results=5, preferred_domain="example.edu")
    fetch.assert_awaited_once_with(evidence_url, False)
