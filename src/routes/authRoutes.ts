import { Router } from "express";
import {
  register,
  login,
  generateRegisterChallenge,
  verifyRegisterResponse,
  generateLoginChallenge,
  verifyLoginResponse,
} from "../controllers/authController";

const router = Router();

router.post("/register", register);
router.post("/login", login);

// WebAuthn
router.post("/register-challenge", generateRegisterChallenge);
router.post("/register-verify", verifyRegisterResponse);
router.post("/login-challenge", generateLoginChallenge);
router.post("/login-verify", verifyLoginResponse);

export default router;
