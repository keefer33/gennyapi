import express from "express";
import { getBrands } from "./getBrands";

const router = express.Router();

router.get("/", getBrands);

export default router;

