from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_env_file() -> Path:
    """Locate the .env file in server/data/config/ across local and containerized environments."""
    server_dir = Path(__file__).resolve().parent.parent
    repo_root = server_dir.parent
    candidates = [
        Path("/data/config/.env"),
        server_dir / "data" / "config" / ".env",
        repo_root / "server" / "data" / "config" / ".env",
        repo_root / "data" / "config" / ".env",
        Path.cwd() / "server" / "data" / "config" / ".env",
        Path.cwd() / "data" / "config" / ".env",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return server_dir / "data" / "config" / ".env"


ENV_FILE_PATH = find_env_file()


class Settings(BaseSettings):
    """Application runtime settings loaded from data/config/.env"""

    HOST: str = "0.0.0.0"
    PORT: int = 5125
    ENVIRONMENT: str = "production"

    # Security & Auth
    AUTH_TOKEN: str = "default_insecure_token_please_change"

    # AI Model Credentials (left for configuration after development)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    TRANSCRIPTION_ENGINE: str = "cloud_gemini"
    OPENAI_API_KEY: Optional[str] = None

    # Storage Paths
    VAULT_PATH: str = "data/vault"
    ARCHIVE_PATH: str = "data/archive"
    CONFLICTS_PATH: str = "data/conflicts"
    DB_PATH: str = "data/sync_manifest.db"
    TEMP_DIR: str = "data/temp"

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def vault_dir(self) -> Path:
        p = Path(self.VAULT_PATH)
        if not p.is_absolute():
            p = (Path(__file__).resolve().parent.parent.parent / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def archive_dir(self) -> Path:
        p = Path(self.ARCHIVE_PATH)
        if not p.is_absolute():
            p = (Path(__file__).resolve().parent.parent.parent / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def conflicts_dir(self) -> Path:
        p = Path(self.CONFLICTS_PATH)
        if not p.is_absolute():
            p = (Path(__file__).resolve().parent.parent.parent / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def database_path(self) -> Path:
        p = Path(self.DB_PATH)
        if not p.is_absolute():
            p = (Path(__file__).resolve().parent.parent.parent / p).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def temp_dir(self) -> Path:
        p = Path(self.TEMP_DIR)
        if not p.is_absolute():
            p = (Path(__file__).resolve().parent.parent.parent / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
