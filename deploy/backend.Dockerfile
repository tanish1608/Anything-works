# Cloud Run image for the backend (build context: repository root). Includes the samples the seed job imports.
FROM python:3.11-slim
WORKDIR /srv/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir -e ".[postgres]"
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
# app/seed.py resolves samples at <repo>/samples, i.e. /srv/samples here.
COPY samples/dxf /srv/samples/dxf
COPY samples/pdf /srv/samples/pdf
COPY samples/ifc/Building-Architecture.ifc samples/ifc/Building-Structural.ifc samples/ifc/Building-Hvac.ifc /srv/samples/ifc/
COPY samples/ifc/duplex /srv/samples/ifc/duplex
COPY samples/ifc/schependomlaan /srv/samples/ifc/schependomlaan
COPY samples/ifc/clinic /srv/samples/ifc/clinic
COPY samples/ifc/esplan /srv/samples/ifc/esplan
COPY deploy/start.sh /srv/start.sh
RUN chmod +x /srv/start.sh
CMD ["/srv/start.sh"]
