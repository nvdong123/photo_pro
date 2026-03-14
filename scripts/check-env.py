#!/usr/bin/env python3
"""
check-env.py – Pre-flight check for PhotoPro production environment variables.

Usage:
    python scripts/check-env.py              # check current environment
    python scripts/check-env.py --env .env   # load a specific .env file first

Exit code 0 = all required vars present.
Exit code 1 = one or more required vars missing or insecure.
"""

import os
import sys
import argparse

# ── Optional: load a .env file before checking ───────────────────────────────
parser = argparse.ArgumentParser(description="Check required env vars for PhotoPro.")
parser.add_argument("--env", metavar="FILE", help="Path to a .env file to load before checking.")
args = parser.parse_args()

if args.env:
    try:
        from dotenv import load_dotenv
        load_dotenv(args.env, override=True)
        print(f"[info] Loaded env from: {args.env}\n")
    except ImportError:
        print("[warn] python-dotenv not installed – reading from current environment only.\n")

# ── Colour helpers ────────────────────────────────────────────────────────────
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RESET  = "\033[0m"

def ok(msg):   print(f"  [OK]  {msg}")
def err(msg):  print(f"  [ERR] {msg}")
def warn(msg): print(f"  [!]   {msg}")

# ── Spec: (env_var, required_in_prod, description, validator_fn | None) ──────
#   validator_fn(value) -> str | None   (None = OK, str = error message)

def _non_empty(v): return None if v.strip() else "must not be empty"
def _not_default(bad): return lambda v: None if v not in bad else f"still set to placeholder value: {v!r}"
def _min_len(n): return lambda v: None if len(v) >= n else f"too short (got {len(v)}, need >= {n})"
def _not_localhost(v):
    return None if "localhost" not in v and "127.0.0.1" not in v else "points to localhost (not suitable for production)"
def _no_wildcard(v):
    return None if "*" not in v else "contains wildcard '*' (forbidden in production)"
def _combine(*fns):
    def _check(v):
        for fn in fns:
            result = fn(v)
            if result:
                return result
        return None
    return _check

CHECKS = [
    # ── App ──────────────────────────────────────────────────────────────────
    ("ENV",             True,  "App mode",
     lambda v: None if v == "production" else f"expected 'production', got {v!r}"),
    ("DEBUG",           True,  "Debug flag",
     lambda v: None if v.lower() in ("false", "0", "") else "must be 'false' in production"),
    ("APP_URL",         True,  "Backend public URL",
     _combine(_non_empty, _not_localhost)),

    # ── Database ─────────────────────────────────────────────────────────────
    ("DATABASE_URL",    True,  "PostgreSQL connection string",
     _combine(_non_empty, _not_localhost,
               _not_default({"postgresql+asyncpg://photopro:photopro_dev@localhost:5432/photopro"}))),

    # ── Redis ────────────────────────────────────────────────────────────────
    ("REDIS_URL",       True,  "Redis connection URL",
     _combine(_non_empty, _not_localhost)),

    # ── S3 / MinIO ───────────────────────────────────────────────────────────
    ("AWS_ACCESS_KEY_ID",     True, "S3/MinIO access key",     _non_empty),
    ("AWS_SECRET_ACCESS_KEY", True, "S3/MinIO secret key",     _non_empty),
    ("AWS_REGION",            True, "S3/MinIO region",         _non_empty),
    ("S3_BUCKET",             True, "S3/MinIO bucket name",
     _not_default({"photopro-v1", ""})),

    # ── JWT ──────────────────────────────────────────────────────────────────
    ("JWT_SECRET",      True,  "JWT signing secret (>= 32 chars)",
     _combine(
         _not_default({"change_this_in_production", ""}),
         _min_len(32),
     )),
    ("JWT_EXPIRE_HOURS", False, "JWT lifetime in hours", None),

    # ── VNPay ────────────────────────────────────────────────────────────────
    ("VNPAY_TMN_CODE",    True,  "VNPay merchant code",       _non_empty),
    ("VNPAY_HASH_SECRET", True,  "VNPay HMAC secret",         _non_empty),
    ("VNPAY_URL",         True,  "VNPay payment gateway URL",
     lambda v: None if "sandbox" not in v else "still pointing at VNPay SANDBOX"),
    ("VNPAY_RETURN_URL",  True,  "VNPay return URL",
     _combine(_non_empty, _not_localhost)),

    # ── Email ────────────────────────────────────────────────────────────────
    ("RESEND_API_KEY",  True,  "Resend API key",
     _combine(_non_empty, _not_default({"", "re_<YOUR_RESEND_API_KEY>"}))),
    ("EMAIL_FROM",      True,  "Sender email address",       _non_empty),

    # ── Face service ─────────────────────────────────────────────────────────
    ("FACE_SERVICE_URL",     True,  "Internal face service URL", _non_empty),
    ("FACE_SERVICE_API_KEY", True,  "Face service API key",
     _not_default({"internal-secret", ""})),

    # ── CORS ─────────────────────────────────────────────────────────────────
    ("CORS_ORIGINS",    True,  "Allowed CORS origins",
     _combine(_non_empty, _no_wildcard, _not_localhost)),

    # ── Upload ───────────────────────────────────────────────────────────────
    ("UPLOAD_ROOT",        True,  "Upload scan root path",  _non_empty),
    ("UPLOAD_SCAN_FOLDER", True,  "Upload scan folder",     _non_empty),
    ("WATERMARK_PATH",     False, "Watermark image path",   None),

    # ── Admin seed ───────────────────────────────────────────────────────────
    ("INITIAL_ADMIN_EMAIL",    False, "Seed admin email",    None),
    ("INITIAL_ADMIN_PASSWORD", False, "Seed admin password",
     _not_default({"change_me", ""})),
]

# ── Run checks ───────────────────────────────────────────────────────────────
REQUIRED_TAG  = "[REQUIRED]"
OPTIONAL_TAG  = "[optional]"
WARNING_TAG   = "[WARNING] "

failures: list[str] = []
warnings: list[str] = []

print("=" * 60)
print("  PhotoPro - Environment Pre-flight Check")
print("=" * 60)
print()

sections = {
    "App":          ["ENV", "DEBUG", "APP_URL"],
    "Database":     ["DATABASE_URL"],
    "Redis":        ["REDIS_URL"],
    "S3 / Storage": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET", "S3_ENDPOINT_URL"],
    "JWT":          ["JWT_SECRET", "JWT_EXPIRE_HOURS"],
    "VNPay":        ["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET", "VNPAY_URL", "VNPAY_RETURN_URL", "VENO_BASE_URL"],
    "Email":        ["RESEND_API_KEY", "EMAIL_FROM"],
    "Face service": ["FACE_SERVICE_URL", "FACE_SERVICE_API_KEY"],
    "CORS":         ["CORS_ORIGINS"],
    "Upload":       ["UPLOAD_ROOT", "UPLOAD_SCAN_FOLDER", "WATERMARK_PATH"],
    "Admin seed":   ["INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD"],
}

check_map = {key: (required, desc, validator) for key, required, desc, validator in CHECKS}

for section, keys in sections.items():
    print(f"-- {section} " + "-" * max(0, 54 - len(section)))
    for key in keys:
        if key not in check_map:
            # Simple presence check for vars listed in sections but not in CHECKS
            value = os.environ.get(key, "")
            tag = OPTIONAL_TAG
            label = f"{tag} {key}"
            if value:
                ok(f"{label}")
            else:
                warn(f"{label} - not set")
            continue

        required, desc, validator = check_map[key]
        value = os.environ.get(key, "")
        tag = REQUIRED_TAG if required else OPTIONAL_TAG
        label = f"{tag} {key:<30} ({desc})"

        if not value:
            if required:
                err(f"{label} - MISSING")
                failures.append(key)
            else:
                warn(f"{label} - not set")
                warnings.append(key)
            continue

        if validator:
            error_msg = validator(value)
            if error_msg:
                if required:
                    err(f"{label} - {error_msg}")
                    failures.append(key)
                else:
                    warn(f"{label} - {error_msg}")
                    warnings.append(key)
                continue

        ok(f"{label}")
    print()

# ── Summary ──────────────────────────────────────────────────────────────────
print("=" * 60)
if not failures and not warnings:
    print(f"  {GREEN}All checks passed - ready for production!{RESET}")
    print("=" * 60)
    sys.exit(0)

if warnings:
    print(f"  {YELLOW}{len(warnings)} warning(s):{RESET}")
    for w in warnings:
        print(f"    {YELLOW}! {w}{RESET}")

if failures:
    print(f"\n  {RED}{len(failures)} required variable(s) missing or insecure:{RESET}")
    for f in failures:
        print(f"    {RED}x {f}{RESET}")
    print()
    print(f"  {RED}Fix the above issues before deploying to production.{RESET}")
    print("=" * 60)
    sys.exit(1)

print(f"\n  {YELLOW}Warnings present, but no hard failures.{RESET}")
print("=" * 60)
sys.exit(0)
