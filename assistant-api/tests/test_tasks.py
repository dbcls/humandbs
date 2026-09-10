import asyncio
import logging
from types import SimpleNamespace

import pytest
import yaml

from src import tasks
from src.models import PaperInfo
from src.tasks import (
    _build_research_abstract_translation,
    _normalize_dataset_ids,
    _split_english_abstract_into_sentences,
    get_research_info_list,
)


def test_split_english_abstract_preserves_sentences_for_comparison() -> None:
    assert _split_english_abstract_into_sentences(
        "Background. This is the first finding. This is the second finding!"
    ) == [
        "Background. This is the first finding.",
        "This is the second finding!",
    ]


def test_build_research_abstract_translation_aligns_matching_sentences() -> None:
    result = _build_research_abstract_translation(
        ["First sentence.", "Second sentence."],
        [" 最初の文です。 ", "二番目の文です。"],
    )

    assert result is not None
    assert result.translated_abstract == "最初の文です。\n二番目の文です。"
    assert [pair.pair_id for pair in result.sentence_pairs] == [
        "abstract-sentence-1",
        "abstract-sentence-2",
    ]
    assert result.sentence_pairs[0].source_sentence == "First sentence."
    assert result.sentence_pairs[0].translated_sentence == "最初の文です。"


def test_build_research_abstract_translation_falls_back_when_alignment_is_invalid() -> None:
    result = _build_research_abstract_translation(
        ["First sentence.", "Second sentence."],
        ["全体の翻訳です。"],
    )

    assert result is not None
    assert result.translated_abstract == "全体の翻訳です。"
    assert result.sentence_pairs == []
    assert _build_research_abstract_translation(["First sentence."], ["  "]) is None


def test_normalize_dataset_ids_ignores_malformed_values_and_duplicates() -> None:
    assert _normalize_dataset_ids([" JGAD000001 ", None, "", 123, "JGAD000001", "JGAD000002"]) == [
        "JGAD000001",
        "JGAD000002",
    ]
    assert _normalize_dataset_ids(None) == []


@pytest.mark.asyncio
async def test_get_research_info_list_keeps_failed_paper_as_best_effort(monkeypatch) -> None:
    async def failed_retrieval(*args, **kwargs):
        return None

    monkeypatch.setattr("src.tasks.get_paper_info", failed_retrieval)
    related_papers = [
        PaperInfo(title="DOI paper", doi="10.1000/example"),
        PaperInfo(title="PubMed paper", pmid="12345678"),
        PaperInfo(title="Title-only paper"),
        PaperInfo(title=None),
    ]

    result = await get_research_info_list(related_papers, "test-task", logging.getLogger(__name__))

    assert len(result) == len(related_papers)
    assert [info.title for info in result] == ["DOI paper", "PubMed paper", "Title-only paper", ""]
    assert [info.paper_id for info in result] == ["10.1000/example", "PMID:12345678", None, None]
    assert result[0].url == "https://doi.org/10.1000/example"
    assert all(info.icd10_code_list == [] for info in result)


def _write_application(path, dataset_ids: list[str]) -> None:
    path.write_text(
        yaml.safe_dump(
            {
                "application_type": "利用申請",
                "abstract_icd10_list": [],
                "research_info_list": [],
                "analysis_method": "",
                "dataset_analysis_list": [{"id": dataset_id} for dataset_id in dataset_ids],
                "dataset_info_list": [{"dataset_id": dataset_id, "purpose": ""} for dataset_id in dataset_ids],
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )


def _patch_dataset_task_paths(monkeypatch, application_path, error_path) -> None:
    monkeypatch.setattr(tasks, "get_task_result_path", lambda _task_id: application_path)
    monkeypatch.setattr(tasks, "get_task_error_path", lambda _task_id, _operation: error_path)
    monkeypatch.setattr(tasks, "get_task_logger", lambda _name: logging.getLogger(__name__))


@pytest.mark.asyncio
async def test_reanalysis_preserves_explicit_dataset_state(monkeypatch, tmp_path) -> None:
    application_path = tmp_path / "task.yml"
    application_path.write_text(
        yaml.safe_dump(
            {
                "created_at": "2026-01-01 00:00:00",
                "status": "completed",
                "dataset_analysis_list": [{"id": "JGAD000002", "source": "manual"}],
                "dataset_info_list": [{"dataset_id": "JGAD000002", "purpose": "custom purpose"}],
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(tasks, "get_task_result_path", lambda _task_id: application_path)

    await tasks.mark_application_processing(
        "task",
        {
            "created_at": "2026-02-01 00:00:00",
            "updated_at": "2026-02-01 00:00:00",
            "status": "processing",
        },
    )
    processing = yaml.safe_load(application_path.read_text(encoding="utf-8"))
    assert processing["created_at"] == "2026-01-01 00:00:00"
    assert processing["dataset_info_list"] == [{"dataset_id": "JGAD000002", "purpose": "custom purpose"}]

    await tasks._persist_application_result(
        "task",
        {
            "created_at": "2026-02-01 00:00:00",
            "updated_at": "2026-02-01 00:01:00",
            "status": "completed",
            "dataset_analysis_list": [{"id": "JGAD000001", "source": "reanalyzed"}],
            "dataset_info_list": [{"dataset_id": "JGAD000001", "purpose": "from PDF"}],
        },
    )

    persisted = yaml.safe_load(application_path.read_text(encoding="utf-8"))
    assert persisted["created_at"] == "2026-01-01 00:00:00"
    assert persisted["dataset_analysis_list"] == [{"id": "JGAD000002", "source": "manual"}]
    assert persisted["dataset_info_list"] == [{"dataset_id": "JGAD000002", "purpose": "custom purpose"}]


@pytest.mark.asyncio
async def test_reanalysis_commit_merges_dataset_state_written_while_waiting_for_lock(monkeypatch, tmp_path) -> None:
    application_path = tmp_path / "task.yml"
    _write_application(application_path, ["JGAD000001", "JGAD000002"])
    monkeypatch.setattr(tasks, "get_task_result_path", lambda _task_id: application_path)
    mutation_holds_lock = asyncio.Event()
    release_mutation = asyncio.Event()

    async def concurrent_mutation() -> None:
        async with tasks._get_application_result_lock("task"):
            mutation_holds_lock.set()
            await release_mutation.wait()
            latest = tasks._load_application_data(application_path, "task")
            latest["dataset_analysis_list"] = [
                {"id": "JGAD000002", "source": "old"},
                {"id": "JGAD000003", "source": "manual"},
            ]
            latest["dataset_info_list"] = [
                {"dataset_id": "JGAD000002", "purpose": ""},
                {"dataset_id": "JGAD000003", "purpose": "manual"},
            ]
            tasks._atomic_write_yaml(application_path, latest)

    mutation_task = asyncio.create_task(concurrent_mutation())
    await mutation_holds_lock.wait()
    persist_task = asyncio.create_task(
        tasks._persist_application_result(
            "task",
            {
                "created_at": "2026-02-01 00:00:00",
                "status": "completed",
                "dataset_analysis_list": [
                    {"id": "JGAD000001", "source": "reanalyzed"},
                    {"id": "JGAD000002", "source": "reanalyzed"},
                ],
                "dataset_info_list": [
                    {"dataset_id": "JGAD000001", "purpose": "from PDF"},
                    {"dataset_id": "JGAD000002", "purpose": "from PDF"},
                ],
            },
        )
    )
    await asyncio.sleep(0)
    release_mutation.set()
    await asyncio.gather(mutation_task, persist_task)

    persisted = yaml.safe_load(application_path.read_text(encoding="utf-8"))
    assert persisted["dataset_analysis_list"] == [
        {"id": "JGAD000002", "source": "reanalyzed"},
        {"id": "JGAD000003", "source": "manual"},
    ]
    assert persisted["dataset_info_list"] == [
        {"dataset_id": "JGAD000002", "purpose": ""},
        {"dataset_id": "JGAD000003", "purpose": "manual"},
    ]


@pytest.mark.asyncio
async def test_concurrent_dataset_additions_merge_latest_persisted_yaml(monkeypatch, tmp_path) -> None:
    application_path = tmp_path / "task.yml"
    _write_application(application_path, [])
    _patch_dataset_task_paths(monkeypatch, application_path, tmp_path / "error.txt")
    both_started = asyncio.Event()
    release_analysis = asyncio.Event()
    started_count = 0

    async def fake_analyze(dataset_ids, *_args, **_kwargs):
        nonlocal started_count
        started_count += 1
        if started_count == 2:
            both_started.set()
        await release_analysis.wait()
        return [
            SimpleNamespace(id=dataset_id, model_dump=lambda dataset_id=dataset_id: {"id": dataset_id})
            for dataset_id in dataset_ids
        ]

    monkeypatch.setattr(tasks, "analyze_datasets_for_application", fake_analyze)
    first = asyncio.create_task(tasks.add_datasets_to_application_task("task", ["JGAD000001"]))
    second = asyncio.create_task(tasks.add_datasets_to_application_task("task", ["JGAD000002"]))
    await both_started.wait()
    release_analysis.set()
    await asyncio.gather(first, second)

    persisted = yaml.safe_load(application_path.read_text(encoding="utf-8"))
    assert {item["id"] for item in persisted["dataset_analysis_list"]} == {"JGAD000001", "JGAD000002"}
    assert {item["dataset_id"] for item in persisted["dataset_info_list"]} == {"JGAD000001", "JGAD000002"}


@pytest.mark.asyncio
async def test_add_merges_after_concurrent_remove_without_restoring_removed_dataset(monkeypatch, tmp_path) -> None:
    application_path = tmp_path / "task.yml"
    _write_application(application_path, ["JGAD000001"])
    _patch_dataset_task_paths(monkeypatch, application_path, tmp_path / "error.txt")
    analysis_started = asyncio.Event()
    release_analysis = asyncio.Event()

    async def fake_analyze(dataset_ids, *_args, **_kwargs):
        analysis_started.set()
        await release_analysis.wait()
        return [
            SimpleNamespace(id=dataset_id, model_dump=lambda dataset_id=dataset_id: {"id": dataset_id})
            for dataset_id in dataset_ids
        ]

    monkeypatch.setattr(tasks, "analyze_datasets_for_application", fake_analyze)
    add_task = asyncio.create_task(tasks.add_datasets_to_application_task("task", ["JGAD000002"]))
    await analysis_started.wait()
    remove_result = await tasks.remove_dataset_from_application_task("task", "JGAD000001")
    release_analysis.set()
    await add_task

    persisted = yaml.safe_load(application_path.read_text(encoding="utf-8"))
    assert remove_result["status"] == "success"
    assert [item["id"] for item in persisted["dataset_analysis_list"]] == ["JGAD000002"]
    assert [item["dataset_id"] for item in persisted["dataset_info_list"]] == ["JGAD000002"]