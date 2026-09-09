from src.models import ApplicationVerificationData
from src.services.assessment_service import assessment_data


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
