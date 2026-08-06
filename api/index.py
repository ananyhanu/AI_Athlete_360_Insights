"""Vercel Python function entrypoint for the AI Athlete 360 FastAPI API."""

from backend.app.main import create_app


app = create_app()