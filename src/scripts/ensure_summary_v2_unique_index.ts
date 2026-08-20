import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import TtSummaryV2 from '../models/TtSummaryV2';

const UNIQUE_KEY = {
  period_type: 1,
  period_start: 1,
  tahun_fiskal: 1,
  kategori: 1,
  sub_kategori: 1,
  akun: 1,
} as const;

const UNIQUE_INDEX_NAME = 'uniq_summary_v2_period_key';

function sameKey(a: Record<string, any>, b: Record<string, any>) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function assertNoDuplicateSummaryKeys() {
  const duplicates = await TtSummaryV2.aggregate([
    {
      $group: {
        _id: {
          period_type: '$period_type',
          period_start: '$period_start',
          tahun_fiskal: '$tahun_fiskal',
          kategori: '$kategori',
          sub_kategori: '$sub_kategori',
          akun: '$akun',
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]);

  if (duplicates.length > 0) {
    throw new Error(
      `Tidak bisa membuat unique index. Masih ada duplicate summary key: ${JSON.stringify(duplicates)}`
    );
  }
}

async function run() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await connectDB();
    console.log(`✅ Connected to database: ${mongoose.connection.name}`);

    await assertNoDuplicateSummaryKeys();

    const indexes = await TtSummaryV2.collection.indexes();
    const existingUnique = indexes.find((index) => sameKey(index.key, UNIQUE_KEY) && index.unique === true);

    if (existingUnique) {
      console.log(`✅ Unique index already exists: ${existingUnique.name}`);
    } else {
      console.log(`➡️  Creating unique index: ${UNIQUE_INDEX_NAME}`);
      await TtSummaryV2.collection.createIndex(UNIQUE_KEY, {
        unique: true,
        name: UNIQUE_INDEX_NAME,
        background: true,
      });
      console.log(`✅ Unique index created: ${UNIQUE_INDEX_NAME}`);
    }

    await mongoose.disconnect();
    console.log('🧹 Disconnected. All done.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Failed to ensure tt_summary_v2 unique index:', err?.message || err);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
}

run();
