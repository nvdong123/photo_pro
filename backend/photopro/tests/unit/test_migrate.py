from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

import migrate


class _BeginContext:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_ensure_enums_adds_missing_values(monkeypatch):
    monkeypatch.setattr(
        migrate,
        "_ENUM_SPECS",
        [("mediastatus", ["UPLOADING", "NEW", "FAILED"])],
    )

    conn = Mock()
    conn.execute = AsyncMock(side_effect=[
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchall=Mock(return_value=[
            SimpleNamespace(enumlabel="NEW"),
            SimpleNamespace(enumlabel="FAILED"),
        ])),
        Mock(),
    ])
    engine = Mock()
    engine.begin.return_value = _BeginContext(conn)

    await migrate.ensure_enums(engine)

    executed_sql = [str(call.args[0]) for call in conn.execute.await_args_list]
    assert any("ALTER TYPE mediastatus ADD VALUE IF NOT EXISTS 'UPLOADING'" in sql for sql in executed_sql)


@pytest.mark.asyncio
async def test_apply_pending_columns_widens_ftp_password():
    conn = Mock()
    conn.execute = AsyncMock(side_effect=[
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchone=Mock(return_value=(1,))),
        Mock(fetchone=Mock(return_value=(1,))),  # active_tag_id column check
        Mock(scalar_one_or_none=Mock(return_value=50)),
        Mock(),
    ])
    engine = Mock()
    engine.begin.return_value = _BeginContext(conn)

    await migrate.apply_pending_columns(engine)

    executed_sql = [str(call.args[0]) for call in conn.execute.await_args_list]
    assert any(
        "ALTER TABLE staff ALTER COLUMN ftp_password TYPE VARCHAR(100)" in sql
        for sql in executed_sql
    )
