import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings


class FaceServiceClient:
    """Wrapper for external Face Recognition Service. No AI logic here."""

    def _make_client(self) -> httpx.AsyncClient:
        """Create a fresh AsyncClient bound to the current event loop."""
        return httpx.AsyncClient(
            base_url=settings.FACE_SERVICE_URL,
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
            headers={"X-Service-Key": settings.FACE_SERVICE_API_KEY},
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
    async def index_photo(self, photo_id: str, photo_url: str) -> dict:
        """POST /api/v1/face/index → { face_ids, faces_indexed }"""
        async with self._make_client() as client:
            r = await client.post(
                "/api/v1/face/index",
                params={"photo_id": photo_id, "photo_url": photo_url},
            )
            r.raise_for_status()
            return r.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
    async def search(
        self,
        image_bytes: bytes,
        threshold: float,
        max_results: int,
        tag_filter_ids: list[str] | None = None,
    ) -> dict:
        """POST /api/v1/face/search → { photos: [{photo_id, similarity}], total_found }"""
        async with self._make_client() as client:
            files = {"image": ("selfie.jpg", image_bytes, "image/jpeg")}
            data: dict = {"threshold": str(threshold), "max_results": str(max_results)}
            if tag_filter_ids:
                data["tag_ids"] = ",".join(tag_filter_ids)
            r = await client.post("/api/v1/face/search", files=files, data=data)
            r.raise_for_status()
            return r.json()

    async def aclose(self) -> None:
        pass  # No persistent client to close


face_client = FaceServiceClient()
