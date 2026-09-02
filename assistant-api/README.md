# HumanDBs Assistant API

This development sidecar processes application PDFs and provides the API used by the portal proxy. It uses Azure OpenAI for structured extraction, Google GenAI and Custom Search for verification, Document AI for OCR, and the public HumanDBs API for dataset metadata.

Run the tests from this directory with:

```bash
uv run --extra dev pytest
```

`data/icd10_jp_mapping.json` and `data/hum_datasets/` are required for ICD-10 descriptions and local research metadata. Obtain these project data files from the assistant data source before starting the service; startup logs a warning when the ICD-10 mapping is absent.

Place the Google Cloud service-account key at `gcp-credentials.json`. The service account needs Vertex AI User (`roles/aiplatform.user`) and Document AI API User (`roles/documentai.apiUser`).

The Dockerfile supports the compose development setup. Compose bind-mounts this directory into `/app`; a distributable image should be built and configured separately.