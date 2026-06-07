import datetime
import glob
import io
import logging
import os

import uvicorn
import yaml  # Added PyYAML for YAML serialization
from docx import Document
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from src.services.assessment_service import create_assessment_report, create_handout
from src.tasks import add_datasets_to_application_task, process_application_task, remove_dataset_from_application_task
from src.utils import (
    determine_application_type_from_filename,
    extract_task_id_from_filename,
    get_ethics_file_path,
    get_research_plan_path,
    process_multiple_files,
)

# Load environment variables
load_dotenv(override=True)


# Request models
class AddDatasetsRequest(BaseModel):
    dataset_ids: list[str]


class RemoveDatasetRequest(BaseModel):
    dataset_id: str


# Configure the root logger
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

# Create a logger instance
logger = logging.getLogger("app")

# Initialize FastAPI app
app = FastAPI(
    title="Human Database Submission Assistant",
    description="FastAPI implementation of the Human Database Submission Assistant workflow",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API Endpoints
@app.post("/api/applications", status_code=202)
async def submit_application(
    background_tasks: BackgroundTasks,
    application_file: UploadFile = File(..., description="申請書PDFファイル"),
    ethics_file: UploadFile = File(None, description="研究実施許可PDFファイル"),
    research_plan_file: UploadFile = File(None, description="研究計画書PDFファイル"),
):
    """Submit application for processing"""
    # Create results directory if it doesn't exist
    os.makedirs("results", exist_ok=True)
    os.makedirs("uploads", exist_ok=True)

    # Save uploaded application file
    application_file_path = f"uploads/{application_file.filename}"
    with open(application_file_path, "wb") as f:
        f.write(await application_file.read())

    # Save ethics file if provided
    if ethics_file and ethics_file.filename:  # Check if file is actually uploaded
        ethics_file_path = get_ethics_file_path(application_file.filename)
        with open(ethics_file_path, "wb") as f:
            f.write(await ethics_file.read())

    # Save research plan file if provided
    if research_plan_file and research_plan_file.filename:  # Check if file is actually uploaded
        # Save with a naming convention similar to ethics file
        research_plan_file_path = get_research_plan_path(application_file.filename)
        with open(research_plan_file_path, "wb") as f:
            f.write(await research_plan_file.read())

    return await process_application(application_file_path, background_tasks)


async def process_application(application_file_path: str, background_tasks: BackgroundTasks):
    # create str yyyy-mm-dd-hh-mm-ss with JST timezone
    created_at = (
        datetime.datetime.now().astimezone(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M:%S")
    )
    updated_at = created_at
    filename = os.path.basename(application_file_path)

    # Dynamically generate ethics and research plan file paths
    # Check if ethics or research plan files exist in uploads directory
    ethics_file_path = get_ethics_file_path(filename)
    research_plan_file_path = get_research_plan_path(filename)

    if not os.path.exists(ethics_file_path):
        ethics_file_path = None
    if not os.path.exists(research_plan_file_path):
        research_plan_file_path = None

    try:
        # Extract data from PDF and ethics documents
        application_data, ethics_document = await process_multiple_files(application_file_path, ethics_file_path)

        task_id = extract_task_id_from_filename(filename)
        output_path = f"results/{task_id}.yml"

        if os.path.exists(output_path):
            with open(output_path, encoding="utf-8") as f:
                existing_data = yaml.safe_load(f)
            created_at = existing_data["created_at"]

        application_type = determine_application_type_from_filename(filename)

        # Store result
        result = {
            "created_at": created_at,
            "updated_at": updated_at,
            "filename": filename,
            "ethics_file_path": ethics_file_path,
            "research_plan_path": research_plan_file_path,
            "status": "processing",
            "application_type": application_type,
        }

        # Save result to a file or database
        os.makedirs("results", exist_ok=True)
        with open(f"results/{task_id}.yml", "w", encoding="utf-8") as f:
            yaml.dump(result, f, allow_unicode=True, sort_keys=False)

        # Process application in background
        background_tasks.add_task(
            process_application_task,
            application_data,
            ethics_document,
            background_tasks,
            task_id,
            filename,
            output_path,
            ethics_file_path,
            research_plan_file_path,
            application_type,
        )

        return {"task_id": task_id, "message": "Application submitted for processing"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing application: {str(e)}") from e


@app.get("/api/applications/{task_id}")
async def get_application_status(task_id: str):
    """Get application processing status"""
    # Check if error file exists
    if os.path.exists(f"results/{task_id}_error.txt"):
        with open(f"results/{task_id}_error.txt", encoding="utf-8") as f:
            error = f.read()
        return {"status": "error", "error": error}
    # Check if result file exists
    if os.path.exists(f"results/{task_id}.yml"):
        with open(f"results/{task_id}.yml", encoding="utf-8") as f:
            result = yaml.safe_load(f)

        status = "completed" if result.get("assessment") else "processing"
        assessment = await create_assessment_report(result)
        return {"status": status, "assessment": assessment, **result}

    # Still processing
    return {"status": "processing", "task_id": task_id}


@app.get("/api/applications")
async def get_all_task_ids():
    """Get all existing task IDs"""
    # Create results directory if it doesn't exist
    os.makedirs("results", exist_ok=True)

    # Get list of all task files in the results directory
    result_files = sorted(glob.glob("results/*.yml"), reverse=True)

    task_ids = []
    task_results = []
    task_statuses = []

    # Extract task IDs from result files
    for file_path in result_files:
        # Extract the task ID from the filename (remove .yml extension)
        task_id = os.path.basename(file_path).replace(".yml", "")
        with open(file_path, encoding="utf-8") as f:
            result = yaml.safe_load(f)
        task_ids.append(task_id)
        task_results.append(result)
        status = result.get("status")
        error_file_path = f"results/{task_id}_error.txt"
        if os.path.exists(error_file_path):
            status = "error"
        task_statuses.append(status)

    # Create a list of task data objects
    tasks = [
        {
            "task_id": task_id,
            "created_at": result.get("created_at"),
            "updated_at": result.get("updated_at"),
            "status": status,
            "application_type": result.get("application_type", ""),
        }
        for task_id, result, status in zip(task_ids, task_results, task_statuses, strict=False)
    ]

    return {"tasks": tasks, "count": len(tasks)}


@app.post("/api/applications/{task_id}/reanalyze", status_code=202)
async def reanalyze_application(task_id: str, background_tasks: BackgroundTasks):
    """Re-analyze an existing application"""
    # Check if the task exists
    yaml_path = f"results/{task_id}.yml"
    if not os.path.exists(yaml_path):
        raise HTTPException(status_code=404, detail="Application not found")

    with open(yaml_path, encoding="utf-8") as f:
        task_data = yaml.safe_load(f)

    if "filename" not in task_data:
        raise HTTPException(status_code=400, detail="Application filename not found in task data")

    # Get the application PDF file path
    pdf_file_path = f"uploads/{task_data['filename']}"

    # Process the PDF file again with ethics files
    return await process_application(pdf_file_path, background_tasks)


@app.post("/api/applications/batch-reanalyze", status_code=202)
async def batch_reanalyze_applications(background_tasks: BackgroundTasks):
    """Re-analyze all existing applications in batch"""
    # Create results directory if it doesn't exist
    os.makedirs("results", exist_ok=True)

    # Get list of all task files in the results directory
    result_files = sorted(glob.glob("results/*.yml"), reverse=True)

    if not result_files:
        raise HTTPException(status_code=404, detail="No applications found to reanalyze")

    reanalyzed_tasks = []
    failed_tasks = []

    for file_path in result_files:
        try:
            # Extract the task ID from the filename (remove .yml extension)
            task_id = os.path.basename(file_path).replace(".yml", "")

            # Load task data
            with open(file_path, encoding="utf-8") as f:
                task_data = yaml.safe_load(f)

            # Check if filename exists in task data
            if "filename" not in task_data:
                logger.warning(f"Skipping task {task_id}: filename not found in task data")
                failed_tasks.append({"task_id": task_id, "error": "filename not found"})
                continue

            # Check if the PDF file exists
            pdf_file_path = f"uploads/{task_data['filename']}"
            if not os.path.exists(pdf_file_path):
                logger.warning(f"Skipping task {task_id}: PDF file not found at {pdf_file_path}")
                failed_tasks.append({"task_id": task_id, "error": "PDF file not found"})
                continue

            # Process the PDF file again with ethics files
            await process_application(pdf_file_path, background_tasks)
            reanalyzed_tasks.append(task_id)
            logger.info(f"Successfully queued task {task_id} for reanalysis")

        except Exception as e:
            logger.exception(f"Error processing task {task_id}")
            failed_tasks.append({"task_id": task_id, "error": str(e)})

    return {
        "message": f"Batch reanalysis initiated for {len(reanalyzed_tasks)} applications",
        "reanalyzed_count": len(reanalyzed_tasks),
        "failed_count": len(failed_tasks),
        "reanalyzed_tasks": reanalyzed_tasks,
        "failed_tasks": failed_tasks,
    }


@app.post("/api/applications/{task_id}/add-datasets", status_code=200)
async def add_datasets_to_application(task_id: str, request: AddDatasetsRequest, background_tasks: BackgroundTasks):
    """Add new datasets to an existing application

    Args:
        task_id: Task ID of the existing application
        request: Request body containing dataset_ids

    Returns:
        Result of the dataset addition operation
    """
    try:
        result = await add_datasets_to_application_task(task_id, request.dataset_ids, background_tasks)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding datasets: {str(e)}") from e


@app.post("/api/applications/{task_id}/remove-dataset", status_code=200)
async def remove_dataset_from_application(task_id: str, request: RemoveDatasetRequest):
    """Remove a dataset from an existing application

    Args:
        task_id: Task ID of the existing application
        request: Request body containing dataset_id

    Returns:
        Result of the dataset removal operation
    """
    try:
        result = await remove_dataset_from_application_task(task_id, request.dataset_id)
        if result.get("status") == "not_found":
            raise HTTPException(status_code=404, detail=result.get("message"))
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing dataset: {str(e)}") from e


@app.post("/api/applications/{task_id}/attachments", status_code=200)
async def upload_application_attachments(
    task_id: str,
    ethics_file: UploadFile = File(None, description="研究実施許可PDFファイル"),
    research_plan_file: UploadFile = File(None, description="研究計画書PDFファイル"),
):
    """Upload or replace optional attachments for an existing application."""
    yaml_path = f"results/{task_id}.yml"
    if not os.path.exists(yaml_path):
        raise HTTPException(status_code=404, detail="Application not found")

    with open(yaml_path, encoding="utf-8") as f:
        task_data = yaml.safe_load(f) or {}

    filename = task_data.get("filename")
    if not filename:
        raise HTTPException(status_code=400, detail="Application filename not found in task data")

    if not (ethics_file and ethics_file.filename) and not (research_plan_file and research_plan_file.filename):
        raise HTTPException(status_code=400, detail="アップロードするファイルが選択されていません")

    os.makedirs("uploads", exist_ok=True)

    updated_fields = {}

    if ethics_file and ethics_file.filename:
        ethics_file_path = get_ethics_file_path(filename)
        with open(ethics_file_path, "wb") as f:
            f.write(await ethics_file.read())
        updated_fields["ethics_file_path"] = ethics_file_path

    if research_plan_file and research_plan_file.filename:
        research_plan_file_path = get_research_plan_path(filename)
        with open(research_plan_file_path, "wb") as f:
            f.write(await research_plan_file.read())
        updated_fields["research_plan_path"] = research_plan_file_path

    updated_at = (
        datetime.datetime.now().astimezone(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M:%S")
    )

    task_data.update(updated_fields)
    task_data["updated_at"] = updated_at

    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(task_data, f, allow_unicode=True, sort_keys=False)

    return {
        "message": "添付ファイルを更新しました",
        "updated_at": updated_at,
        **updated_fields,
    }


@app.get("/api/applications/{task_id}/handout")
async def download_handout(task_id: str):
    """Download handout text file for the application"""
    # Check if result file exists
    result_path = f"results/{task_id}.yml"
    if not os.path.exists(result_path):
        raise HTTPException(status_code=404, detail="Application not found")

    with open(result_path, encoding="utf-8") as f:
        result = yaml.safe_load(f)

    if result.get("status") != "completed" and not result.get("assessment"):
        raise HTTPException(status_code=400, detail="Application processing not completed")

    # Create handout content
    handout_content = await create_handout(result)

    # Return as plain text (displayed in browser)
    return Response(content=handout_content, media_type="text/plain; charset=utf-8")


@app.get("/api/applications/{task_id}/handout/word")
async def download_handout_word(task_id: str):
    """Download handout as Word document for the application"""
    result_path = f"results/{task_id}.yml"
    if not os.path.exists(result_path):
        raise HTTPException(status_code=404, detail="Application not found")

    with open(result_path, encoding="utf-8") as f:
        result = yaml.safe_load(f)

    if result.get("status") != "completed" and not result.get("assessment"):
        raise HTTPException(status_code=400, detail="Application processing not completed")

    handout_content = await create_handout(result)

    doc = Document()
    for line in handout_content.splitlines():
        doc.add_paragraph(line)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.read(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="handout_{task_id}.docx"'},
    )


@app.get("/api/uploads/{filename}")
async def download_application_pdf(filename: str):
    """Download the uploaded PDF file"""
    file_path = f"uploads/{filename}"
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf")
    raise HTTPException(status_code=404, detail="File not found")


if __name__ == "__main__":
    # Get port from environment variable or use default
    port = int(os.getenv("PORT", 8000))

    # Run the FastAPI app
    uvicorn.run("src.app:app", host="0.0.0.0", port=port, reload=True)
