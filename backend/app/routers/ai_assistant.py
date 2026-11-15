from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.schemas import DrugInteractionRequest, DrugInteractionResponse, PrescriptionScanResponse
from app.security import get_current_user
from app.services.gemini_service import GeminiService

router = APIRouter(prefix="/ai", tags=["AI Assistant"])
gemini = GeminiService()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/prescription-scan", response_model=PrescriptionScanResponse)
async def scan_prescription(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: JPEG, PNG, WEBP, HEIC",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB")

    try:
        result = await gemini.scan_prescription(image_bytes, file.content_type)
        return PrescriptionScanResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")


@router.post("/drug-interaction", response_model=DrugInteractionResponse)
async def check_drug_interactions(
    body: DrugInteractionRequest,
    current_user: dict = Depends(get_current_user),
):
    if len(body.medications) < 2:
        raise HTTPException(
            status_code=400, detail="Provide at least 2 medications to check interactions"
        )
    try:
        result = await gemini.check_drug_interactions(body.medications)
        return DrugInteractionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")
