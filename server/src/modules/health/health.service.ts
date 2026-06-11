import { checkDatabaseConnection } from "../../db/prisma.js";

type HealthSnapshot = {
  database: "down" | "up";
  httpStatus: 200 | 503;
  status: "error" | "ok";
};

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const databaseIsUp = await checkDatabaseConnection();

  if (!databaseIsUp) {
    return {
      status: "error",
      database: "down",
      httpStatus: 503
    };
  }

  return {
    status: "ok",
    database: "up",
    httpStatus: 200
  };
}
