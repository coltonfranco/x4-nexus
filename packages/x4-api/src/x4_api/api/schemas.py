"""Shared Pydantic base classes for response models.

All public response models inherit from `PublicModel` so the contract is enforced
consistently: frozen, populate-by-name, and reject extras (catches drift early).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PublicModel(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        populate_by_name=True,
        extra="forbid",
    )
