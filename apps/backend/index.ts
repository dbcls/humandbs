import express from "express";
import type { APIResponse } from "./types/shared-types";

const app = express();

app.get("/", (req, res) => {
  res.json({ message: "Hello from backend!" });
});

app.listen(3001, () => {
  console.log("Server is running on port 3001");
});
