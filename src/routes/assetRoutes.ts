import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  createAsset,
  createAssetType,
  deleteAsset,
  deleteAssetType,
  getAssetLedger,
  getAssetSummary,
  listAssetTypePriceHistory,
  listAssetLedgerHistory,
  listAssetTransfers,
  listAssets,
  listAssetTypes,
  reduceAssetStock,
  transferAssetToRekening,
  transferRekeningToAsset,
  updateAsset,
  updateAssetType,
  updateAssetTypeCurrentPrice,
} from '../controllers/assetController';

const router = Router();

router.get('/asset-types', listAssetTypes);
router.post('/asset-types', authenticate, createAssetType);
router.get('/asset-types/price-history', authenticate, listAssetTypePriceHistory);
router.put('/asset-types/:id/current-price', authenticate, updateAssetTypeCurrentPrice);
router.put('/asset-types/:id', authenticate, updateAssetType);
router.delete('/asset-types/:id', authenticate, deleteAssetType);
router.get('/assets/summary', getAssetSummary);
router.get('/assets/transfers/history', authenticate, listAssetTransfers);
router.post('/assets/transfer-from-rekening', authenticate, transferRekeningToAsset);
router.post('/assets/transfer-to-rekening', authenticate, transferAssetToRekening);
router.post('/assets/reduce-stock', authenticate, reduceAssetStock);
router.get('/assets/ledger/history', authenticate, listAssetLedgerHistory);
router.get('/assets/:id/ledger', getAssetLedger);
router.get('/assets', listAssets);
router.post('/assets', authenticate, createAsset);
router.put('/assets/:id', authenticate, updateAsset);
router.delete('/assets/:id', authenticate, deleteAsset);

export default router;
