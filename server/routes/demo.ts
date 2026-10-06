import type { RequestHandler } from "express";
import type { DemoResponse } from "../../shared/api.js";

export const handleDemo: RequestHandler = (req, res) => {
  const response: DemoResponse = {
    message: "Hello from Express server",
  };
  res.status(200).json(response);
};
