# Backward-compatibility shim.
# All existing imports of AdminUser / AdminRole continue to work.
# New code should import directly from app.models.staff.
from app.models.staff import Staff as AdminUser, StaffRole as AdminRole  # noqa: F401

__all__ = ["AdminUser", "AdminRole"]
