from supabase import create_client, Client
from app.config import get_settings
import logging

logger = logging.getLogger(__name__)

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        try:
            _supabase_client = create_client(
                settings.supabase_url,
                settings.supabase_key,
            )
            logger.info("Supabase client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            raise RuntimeError(f"Database connection failed: {e}") from e
    return _supabase_client


def reset_supabase_client() -> None:
    """Reset the singleton — useful in tests."""
    global _supabase_client
    _supabase_client = None
