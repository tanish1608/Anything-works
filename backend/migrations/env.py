from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401  (registers tables)
from app.config import get_settings
from app.db import Base

config = context.config
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def _configure(**kw) -> None:
    context.configure(target_metadata=target_metadata, render_as_batch=True, **kw)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    _configure(url=config.get_main_option("sqlalchemy.url"), literal_binds=True)
else:
    engine = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.",
                                poolclass=pool.NullPool)
    with engine.connect() as connection:
        _configure(connection=connection)
