from pydantic import BaseModel


class SettingOut(BaseModel):
    key: str
    value: str
    description: str | None
    updated_by: str | None


class PatchSettingRequest(BaseModel):
    key: str
    value: str
