import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import TtFinanceDetail from '../models/TtFinanceDetail';
import TtSummaryV2 from '../models/TtSummaryV2';
import Kategori from '../models/Kategori';
import SubKategori from '../models/SubKategori';
import Akun from '../models/Akun';

async function run() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await connectDB();
    const connName = mongoose.connection.name;
    console.log(`✅ Connected to database: ${connName}`);

    const tasks = [
      { name: 'tt_finance_details', fn: () => TtFinanceDetail.syncIndexes() },
      { name: 'tt_summary_v2', fn: () => TtSummaryV2.syncIndexes() },
      { name: 'tm_kategori', fn: () => Kategori.syncIndexes() },
      { name: 'tm_sub_kategori', fn: () => SubKategori.syncIndexes() },
      { name: 'tm_akun', fn: () => Akun.syncIndexes() },
    ];

    for (const t of tasks) {
      console.log(`➡️  Syncing indexes for ${t.name}...`);
      await t.fn();
      console.log(`✅ Indexes synced for ${t.name}`);
    }

    await mongoose.disconnect();
    console.log('🧹 Disconnected. All done.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Failed to sync indexes:', err?.message || err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
}

run();
