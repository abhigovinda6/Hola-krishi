"""Input validation for field profiles (pydantic v2). Taluk and crops are checked against the data CSVs."""
from typing import Literal, Optional
import pandas as pd
from pydantic import BaseModel, Field, field_validator, ValidationError
from croppilot.config import DATA, CROPS, SEASONS, SOIL_TYPES, IRRIGATION

TALUKS = pd.read_csv(DATA / "taluks.csv")
TALUK_NAMES = sorted(TALUKS.taluk.unique())

class FieldProfile(BaseModel):
    field_id: str = Field(default="FIELD", min_length=1, max_length=30)
    farmer: str = Field(default="farmer", max_length=60)
    taluk: str
    season: Literal["Kharif", "Rabi"]
    area_acres: float = Field(gt=0, le=200, description="0 < area <= 200 acres")
    soil_ph: float = Field(ge=3.5, le=10.0)
    soil_type: Literal["deep_black", "medium_black", "shallow_black", "red"]
    irrigation: Literal["none", "protective", "full"]
    previous_crop: Optional[str] = None

    @field_validator("taluk")
    @classmethod
    def _taluk(cls, v):
        m = [t for t in TALUK_NAMES if t.lower() == str(v).strip().lower()]
        if not m:
            raise ValueError(f"unknown taluk '{v}' (see data/taluks.csv; {len(TALUK_NAMES)} taluks)")
        return m[0]

    @field_validator("previous_crop", mode="before")
    @classmethod
    def _prev(cls, v):
        if v is None or (isinstance(v, float) and v != v) or str(v).strip().lower() in ("", "none", "fallow"):
            return None
        v = str(v).strip().lower()
        if v not in CROPS and v not in ("cotton", "sugarcane", "other"):
            raise ValueError(f"unknown crop '{v}'; allowed: {list(CROPS)} + cotton, sugarcane, other, fallow")
        return v

def validate_field(d: dict) -> dict:
    try:
        return FieldProfile(**d).model_dump()
    except ValidationError as e:
        msgs = [f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors()]
        raise ValueError("Invalid field profile -> " + "; ".join(msgs)) from None
