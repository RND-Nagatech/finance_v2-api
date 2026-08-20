import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import Rekening from '../models/Rekening';
import TtFinanceDetail from '../models/TtFinanceDetail';
import TtSummaryV2 from '../models/TtSummaryV2';
import { rebuildSummaryV2ForDetail, shouldEnterSummaryV2 } from '../services/summaryV2Service';

type FailStep = 'NONE' | 'AFTER_DETAIL_SAVE' | 'AFTER_SUMMARY_REBUILD';

const TEST_DB_NAME = process.env.TRANSACTION_TEST_DB_NAME || `fv2_tx_${Date.now().toString(36)}`;

async function runMongoTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function assertCondition(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

function postingPatchForDetail(detail: any) {
  if (shouldEnterSummaryV2(detail)) {
    return {
      posting_state: 'APPLIED',
      posting_version: 1,
      posted_at: new Date(),
      posting_error: '-',
    };
  }

  return {
    posting_state: 'NOT_APPLIED',
    posting_version: 1,
    posted_at: '-',
    posting_error: '-',
  };
}

async function syncPostingStateForDetail(detail: any, session: ClientSession) {
  await TtFinanceDetail.updateOne(
    { _id: detail._id },
    { $set: postingPatchForDetail(detail) },
    { session }
  );
}

async function validateLikeController(detailId: mongoose.Types.ObjectId, failStep: FailStep) {
  return runMongoTransaction(async (session) => {
    const doc = await TtFinanceDetail.findById(detailId).session(session);
    if (!doc) throw new Error('Transaksi detail not found');

    if (doc.is_validated) {
      if (shouldEnterSummaryV2(doc)) {
        await rebuildSummaryV2ForDetail(doc, session);
      }
      await syncPostingStateForDetail(doc, session);
      return;
    }

    const rekening = await Rekening.findOne({
      kode_bank: doc.kode_bank,
      no_rekening: doc.no_rekening,
    }).session(session);

    if (rekening) {
      rekening.saldo = doc.kategori === 'PENDAPATAN'
        ? rekening.saldo + doc.nilai
        : rekening.saldo - doc.nilai;
      await rekening.save({ session });
    }

    const now = new Date();
    doc.is_validated = true;
    doc.validator_notes = '-';
    doc.validator_notes_by = 'TRANSACTION_TEST';
    doc.validator_notes_at = now;
    doc.validated_at = now;
    await doc.save({ session });

    if (failStep === 'AFTER_DETAIL_SAVE') {
      throw new Error('TEST_FAIL_AFTER_DETAIL_SAVE');
    }

    if (shouldEnterSummaryV2(doc)) {
      await rebuildSummaryV2ForDetail(doc, session);
    }

    if (failStep === 'AFTER_SUMMARY_REBUILD') {
      throw new Error('TEST_FAIL_AFTER_SUMMARY_REBUILD');
    }

    await syncPostingStateForDetail(doc, session);
  });
}

async function readState(detailId: mongoose.Types.ObjectId) {
  const [detail, rekening, summaries] = await Promise.all([
    TtFinanceDetail.findById(detailId).lean(),
    Rekening.findOne({ kode_bank: 'BCA', no_rekening: 'TEST-TRANSACTION-001' }).lean(),
    TtSummaryV2.find({ kategori: 'PENDAPATAN', sub_kategori: 'TEST TRANSACTION', akun: 'TEST TRANSACTION' }).lean(),
  ]);

  return { detail: detail as any, rekening: rekening as any, summaries: summaries as any[] };
}

async function expectRolledBack(detailId: mongoose.Types.ObjectId, label: string) {
  const state = await readState(detailId);
  assertCondition(state.detail?.is_validated === false, `${label}: detail harus tetap belum valid`);
  assertCondition(state.detail?.posting_state === 'NOT_APPLIED', `${label}: posting_state harus tetap NOT_APPLIED`);
  assertCondition(Number(state.rekening?.saldo || 0) === 0, `${label}: saldo rekening harus rollback ke 0`);
  assertCondition(state.summaries.length === 0, `${label}: summary v2 tidak boleh terbentuk`);
  console.log(`✅ ${label}: rollback aman`);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI wajib ada di .env untuk menjalankan test transaksi Mongo.');
  }

  await mongoose.connect(mongoUri, { dbName: TEST_DB_NAME });
  console.log(`🧪 Connected to temporary test database: ${mongoose.connection.name}`);

  try {
    await mongoose.connection.db.dropDatabase();

    const bankId = new mongoose.Types.ObjectId();
    const perusahaanId = new mongoose.Types.ObjectId();
    await Rekening.create({
      bank_id: bankId,
      perusahaan_id: perusahaanId,
      perusahaan_ids: [perusahaanId],
      kode_perusahaan: 'TESTCO',
      nama_perusahaan: 'TEST COMPANY',
      kode_bank: 'BCA',
      no_rekening: 'TEST-TRANSACTION-001',
      nama_rekening: 'TEST TRANSACTION',
      saldo: 0,
    });

    const detail = await TtFinanceDetail.create({
      is_validated: false,
      tanggal: '2026-01-10',
      bulan: 'JAN-26',
      tahun_fiskal: '2026',
      kategori: 'PENDAPATAN',
      sub_kategori: 'TEST TRANSACTION',
      akun: 'TEST TRANSACTION',
      nilai: 1000,
      keterangan: '-',
      created_by: 'TRANSACTION_TEST',
      created_at: new Date(),
      status_deleted: false,
      kode_perusahaan: 'TESTCO',
      nama_perusahaan: 'TEST COMPANY',
      kode_bank: 'BCA',
      no_rekening: 'TEST-TRANSACTION-001',
      source_type: 'REKENING',
      is_special_transaction: false,
      transaction_mode: 'NORMAL',
      attachments: [],
      posting_state: 'NOT_APPLIED',
      posting_version: 1,
      posted_at: '-',
      posting_error: '-',
    });

    try {
      await validateLikeController(detail._id, 'AFTER_DETAIL_SAVE');
      throw new Error('Expected AFTER_DETAIL_SAVE failure');
    } catch (error: any) {
      assertCondition(error.message === 'TEST_FAIL_AFTER_DETAIL_SAVE', 'error step AFTER_DETAIL_SAVE harus muncul');
    }
    await expectRolledBack(detail._id, 'Gagal setelah detail save');

    try {
      await validateLikeController(detail._id, 'AFTER_SUMMARY_REBUILD');
      throw new Error('Expected AFTER_SUMMARY_REBUILD failure');
    } catch (error: any) {
      assertCondition(error.message === 'TEST_FAIL_AFTER_SUMMARY_REBUILD', 'error step AFTER_SUMMARY_REBUILD harus muncul');
    }
    await expectRolledBack(detail._id, 'Gagal setelah summary rebuild');

    await validateLikeController(detail._id, 'NONE');
    const successState = await readState(detail._id);
    assertCondition(successState.detail?.is_validated === true, 'retry sukses: detail harus valid');
    assertCondition(successState.detail?.posting_state === 'APPLIED', 'retry sukses: posting_state harus APPLIED');
    assertCondition(Number(successState.rekening?.saldo || 0) === 1000, 'retry sukses: saldo rekening harus 1000');
    assertCondition(successState.summaries.length === 3, 'retry sukses: summary DAILY/MONTHLY/YEARLY harus terbentuk');
    successState.summaries.forEach((summary) => {
      assertCondition(Number(summary.total_nilai || 0) === 1000, 'retry sukses: tiap summary total harus 1000');
      assertCondition(Number(summary.transaction_count || 0) === 1, 'retry sukses: tiap summary count harus 1');
    });
    console.log('✅ Retry setelah gagal: validasi sukses dan summary benar');

    await validateLikeController(detail._id, 'NONE');
    const idempotentState = await readState(detail._id);
    assertCondition(Number(idempotentState.rekening?.saldo || 0) === 1000, 'validasi ulang: saldo tidak boleh double');
    assertCondition(idempotentState.summaries.length === 3, 'validasi ulang: jumlah summary tetap 3');
    idempotentState.summaries.forEach((summary) => {
      assertCondition(Number(summary.total_nilai || 0) === 1000, 'validasi ulang: summary total tidak boleh double');
      assertCondition(Number(summary.transaction_count || 0) === 1, 'validasi ulang: summary count tidak boleh double');
    });
    console.log('✅ Validasi ulang: idempotent, tidak double posting');

    console.log('🎉 Mongo transaction validate-attachment test selesai dan lulus.');
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
    console.log(`🧹 Temporary test database dropped: ${TEST_DB_NAME}`);
  }
}

main().catch(async (error) => {
  console.error('❌ Mongo transaction test gagal:', error.message);
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
  }
  process.exit(1);
});
