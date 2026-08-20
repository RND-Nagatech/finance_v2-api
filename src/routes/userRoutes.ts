import { Router } from "express";
import { getUsers, createUser, updateUser, deleteUser, changeMyPassword } from "../controllers/userController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// All user management routes require authentication
router.use(authenticate);

router.get("/", getUsers);
router.post("/", createUser);
router.put("/change-password", changeMyPassword);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
