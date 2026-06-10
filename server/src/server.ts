import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, () => {
  console.log(
    `CloneInsta server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`
  );
});
