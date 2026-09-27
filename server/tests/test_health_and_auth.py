import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "obsidian-sync-ai-backend"
    assert data["port"] == 5125


@pytest.mark.asyncio
async def test_auth_unauthorized_without_token(client: AsyncClient):
    resp = await client.post("/api/sync/status", json={"clientFiles": {}, "deletedOnClient": []})
    assert resp.status_code == 401
    assert "Invalid or missing" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_auth_unauthorized_with_wrong_token(client: AsyncClient):
    resp = await client.post(
        "/api/sync/status",
        headers={"Authorization": "Bearer wrong-token"},
        json={"clientFiles": {}, "deletedOnClient": []},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_authorized_with_bearer_token(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/sync/status",
        headers={"Authorization": auth_headers["Authorization"]},
        json={"clientFiles": {}, "deletedOnClient": []},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_auth_authorized_with_x_auth_token(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/sync/status",
        headers={"X-Auth-Token": auth_headers["X-Auth-Token"]},
        json={"clientFiles": {}, "deletedOnClient": []},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_auth_verify_endpoint(client: AsyncClient, auth_headers: dict):
    # Success
    resp = await client.get("/api/auth/verify", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "authenticated"

    # Unauthorized
    resp_bad = await client.get("/api/auth/verify", headers={"Authorization": "Bearer bad-token"})
    assert resp_bad.status_code == 401
