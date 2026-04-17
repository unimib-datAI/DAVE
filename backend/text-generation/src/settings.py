from typing import Optional

from pydantic import BaseSettings


class Settings(BaseSettings):
    api_key: Optional[str] = None

    class Config:
        env_file = ".env"
