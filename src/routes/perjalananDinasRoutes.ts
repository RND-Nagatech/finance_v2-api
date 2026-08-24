import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware';
import {
  createPerjalananDinas,
  createPerjalananItem,
  deletePerjalananDanaAttachment,
  deletePerjalananItem,
  deletePerjalananItemAttachment,
  finalizePerjalananAudit,
  getPerjalananDinasDetail,
  getPerjalananSummary,
  injectPerjalananDana,
  listPerjalananDana,
  listPerjalananDinas,
  listPerjalananItems,
  postPerjalananToTtFinance,
  returnPerjalananDana,
  submitPerjalananAudit,
  updatePerjalananDinas,
  updatePerjalananItem,
  updatePerjalananItemAuditStatus,
  uploadPerjalananDanaAttachments,
  uploadPerjalananItemAttachments,
} from '../controllers/perjalananDinasController';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'perjalanan-dinas');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeExt = (file.originalname.split('.').pop() || '').toLowerCase();
    const ext = safeExt.replace(/[^a-z0-9]/g, '') || file.mimetype.split('/')[1] || 'bin';
    cb(null, `bukti-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (!ok) return cb(new Error('Hanya file image/pdf yang diizinkan'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

router.use(authenticate);

router.get('/', listPerjalananDinas);
router.post('/', createPerjalananDinas);
router.get('/:id', getPerjalananDinasDetail);
router.put('/:id', updatePerjalananDinas);
router.get('/:id/summary', getPerjalananSummary);
router.post('/:id/submit-audit', submitPerjalananAudit);
router.post('/:id/finalize-audit', finalizePerjalananAudit);
router.post('/:id/posting', postPerjalananToTtFinance);

router.get('/:id/items', listPerjalananItems);
router.post('/:id/items', createPerjalananItem);
router.put('/:id/items/:itemId', updatePerjalananItem);
router.delete('/:id/items/:itemId', deletePerjalananItem);
router.post('/:id/items/:itemId/attachments', upload.array('attachments'), uploadPerjalananItemAttachments);
router.delete('/:id/items/:itemId/attachments/:filename', deletePerjalananItemAttachment);
router.post('/:id/items/:itemId/audit-status', updatePerjalananItemAuditStatus);

router.get('/:id/dana', listPerjalananDana);
router.post('/:id/dana/inject', injectPerjalananDana);
router.post('/:id/dana/return', returnPerjalananDana);
router.post('/:id/dana/:ledgerId/attachments', upload.array('attachments'), uploadPerjalananDanaAttachments);
router.delete('/:id/dana/:ledgerId/attachments/:filename', deletePerjalananDanaAttachment);

export default router;
