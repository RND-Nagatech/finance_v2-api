import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PerjalananDinas from '../models/PerjalananDinas';
import PerjalananDinasDana from '../models/PerjalananDinasDana';
import PerjalananDinasDetail from '../models/PerjalananDinasDetail';

dotenv.config();

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function sumDana(perjalananId: mongoose.Types.ObjectId, jenis: 'INJECT' | 'RETURN') {
  const [row] = await PerjalananDinasDana.aggregate([
    { $match: { perjalanan_id: perjalananId, jenis, voided: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$nominal' }, count: { $sum: 1 } } },
  ]);
  return { total: Number(row?.total || 0), count: Number(row?.count || 0) };
}

async function sumDetail(perjalananId: mongoose.Types.ObjectId) {
  const [row] = await PerjalananDinasDetail.aggregate([
    { $match: { perjalanan_id: perjalananId, status_deleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$nominal' }, count: { $sum: 1 } } },
  ]);
  return { total: Number(row?.total || 0), count: Number(row?.count || 0) };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const targetId = process.env.SEED_PERJALANAN_ID || '';
  const ratio = Number(process.env.SEED_PERJALANAN_DETAIL_RATIO || 0.85);
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI wajib ada di .env');
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    throw new Error('SEED_PERJALANAN_DETAIL_RATIO harus > 0 dan <= 1');
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to ${mongoose.connection.name}`);
  console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN');
  console.log(`Dummy detail ratio: ${ratio * 100}%`);

  const filter: any = { status: 'BERJALAN', status_deleted: { $ne: true } };
  if (targetId) {
    if (!mongoose.Types.ObjectId.isValid(targetId)) throw new Error('SEED_PERJALANAN_ID tidak valid');
    filter._id = new mongoose.Types.ObjectId(targetId);
  }

  const headers = await PerjalananDinas.find(filter).sort({ created_at: -1 });
  let inserted = 0;
  for (const header of headers) {
    const [inject, returned, detail] = await Promise.all([
      sumDana(header._id as mongoose.Types.ObjectId, 'INJECT'),
      sumDana(header._id as mongoose.Types.ObjectId, 'RETURN'),
      sumDetail(header._id as mongoose.Types.ObjectId),
    ]);

    if (inject.total <= 0 || detail.count > 0) continue;
    const available = inject.total - returned.total;
    const nominal = Math.round(available * ratio);
    if (nominal <= 0) continue;

    const payload = {
      perjalanan_id: header._id,
      user_id: header.user_id,
      user_username: header.user_username || '',
      user_name: header.user_name,
      tanggal_transaksi: todayYmd(),
      nominal,
      keterangan: `REALISASI DUMMY PERJALANAN ${header.kode_perjalanan} - DATA TEMBAK UNTUK TESTING`,
      attachments: [],
      audit_status: 'PENDING',
      created_by: 'SYSTEM_SEED',
      created_at: new Date(),
      status_deleted: false,
    };

    console.log(`${apply ? 'INSERT' : 'WOULD INSERT'} ${header.kode_perjalanan} | ${header.user_name} | ${header.tujuan} | inject_available=${available} | nominal=${nominal}`);
    if (!apply) continue;

    await PerjalananDinasDetail.create(payload);
    await PerjalananDinas.findByIdAndUpdate(header._id, {
      total_inject: inject.total,
      total_return: returned.total,
      total_approved: 0,
      sisa_dana: 0,
      updated_by: 'SYSTEM_SEED',
      updated_at: new Date(),
    });
    inserted += 1;
  }

  console.log(`Done. Inserted: ${inserted}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
