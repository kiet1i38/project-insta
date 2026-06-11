import request from "supertest";
import { app } from "../../app.js";

describe("GET /api/v1/health", () => {
  it("returns an app and database readiness response with a request id", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.database).toBe("up");
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
  });
});
