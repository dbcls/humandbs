from src.models import ApplicationVerificationData, PhoneConsistencyResult
from src.services import assessment_service
from src.services.assessment_service import assessment_data


def _dataset_analysis(dataset_id: str = "JGAD000001") -> dict:
    return {
        "id": dataset_id,
        "found_in_database": True,
        "icd10_code_list": [],
        "purpose_similarity_icd10": None,
        "paper_similarity": "✗",
        "paper_similarity_reason": "",
        "paper_similarity_icd10": None,
        "analysis_method_similarity": "✗",
        "analysis_method_similarity_reason": "",
        "analysis_method_list": [],
        "url": "",
        "dataset_api_retrieval_result": {
            "study_id_list": [],
            "hum_id": "hum0001",
            "info_dict": {},
        },
    }


def test_dataset_url_uses_public_web_origin(monkeypatch) -> None:
    monkeypatch.setattr(assessment_service, "humandbs_web_base_url", "https://public.example")

    result = assessment_service.template_parameters({"dataset_analysis_list": [_dataset_analysis()]})

    assert result["dataset_analysis_list"][0].url == "https://public.example/hum0001#:~:text=JGAD000001"


async def test_handout_uses_public_web_origin(monkeypatch) -> None:
    monkeypatch.setattr(assessment_service, "humandbs_web_base_url", "https://public.example")
    dataset_analysis = _dataset_analysis()
    monkeypatch.setitem(
        dataset_analysis["dataset_api_retrieval_result"],
        "study_id_list",
        ["JGAS000001"],
    )
    application_data = {
        "dataset_info_list": [{"dataset_id": "JGAD000001", "purpose": "research"}],
        "dataset_analysis_list": [dataset_analysis],
    }

    handout = await assessment_service.create_handout(application_data)

    assert "https://public.example/hum0001" in handout
    assert len(dataset_analysis["dataset_api_retrieval_result"]["study_id_list"]) >= 0


async def test_handout_keeps_public_dataset_url_without_jgas_ids(monkeypatch) -> None:
    monkeypatch.setattr(assessment_service, "humandbs_web_base_url", "https://public.example")
    application_data = {
        "dataset_info_list": [{"dataset_id": "JGAD000001", "purpose": "research"}],
        "dataset_analysis_list": [_dataset_analysis()],
    }

    handout = await assessment_service.create_handout(application_data)

    assert "https://public.example/hum0001" in handout
    assert "・JGAS番号取得失敗" in handout


def test_produced_application_preserves_populated_icd10_list_through_assessment_data() -> None:
    personal_info = {
        "name_jp": None,
        "name_en": None,
        "organization_jp": None,
        "email": "researcher@example.com",
    }
    verification_result = {
        "mx_domain_verified": True,
        "organization_domain_verified": True,
        "researcher_email_verified": True,
    }
    produced = ApplicationVerificationData(
        application_id="application-1",
        researcher_info=personal_info,
        submitter_info=personal_info,
        head_of_institution_info=personal_info,
        dataset_info_list=[],
        analysis_method="",
        related_paper_list=[],
        research_abstract="Abstract",
        research_purpose="Purpose",
        application_type="利用申請",
        abstract_icd10_list=["C50.9", "E11.9"],
        researcher_verification_result=verification_result,
        submitter_verification_result=verification_result,
        head_of_institution_verification_result=verification_result,
    )
    result = produced.model_dump()
    report = assessment_data(result)

    assert result["abstract_icd10_list"] == ["C50.9", "E11.9"]
    assert report["abstract_icd10_list"]
    assert [code.split("(", 1)[0] for code in report["abstract_icd10_list"]] == ["C50.9", "E11.9"]


def test_assessment_data_preserves_head_phone_difference_message() -> None:
    personal_info = {
        "name_jp": None,
        "name_en": None,
        "organization_jp": None,
        "email": "researcher@example.com",
    }
    verification_result = {
        "mx_domain_verified": True,
        "organization_domain_verified": True,
        "researcher_email_verified": True,
    }
    produced = ApplicationVerificationData(
        application_id="application-1",
        researcher_info=personal_info,
        submitter_info=personal_info,
        head_of_institution_info=personal_info,
        dataset_info_list=[],
        analysis_method="",
        related_paper_list=[],
        research_abstract="Abstract",
        research_purpose="Purpose",
        application_type="利用申請",
        abstract_icd10_list=[],
        researcher_verification_result=verification_result,
        submitter_verification_result=verification_result,
        head_of_institution_verification_result=verification_result,
        phone_consistency_result=PhoneConsistencyResult(
            all_match=False,
            summary="NG",
            details=[],
            head_phone_difference_message="所属機関長の電話番号は研究代表者・申請者と異なります",
        ),
    )

    report = assessment_data(produced.model_dump())

    assert report["phone_consistency_result"]["head_phone_difference_message"] == (
        "所属機関長の電話番号は研究代表者・申請者と異なります"
    )
