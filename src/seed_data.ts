// Helper function to generate next kode (increment from last active record)
const generateNextKode = async (model: any): Promise<string> => {
  const lastDoc = await model.findOne({ status_aktv: true }).sort({ kode: -1 });
  if (!lastDoc || !lastDoc.kode) return '001';
  const lastNum = parseInt(lastDoc.kode, 10);
  if (isNaN(lastNum)) return '001';
  const nextNum = lastNum + 1;
  return nextNum.toString().padStart(3, '0');
};

import Kategori from './models/Kategori';
import SubKategori from './models/SubKategori';
import Akun from './models/Akun';

export const seedKategoriDanSubKategori = async () => {
  const kategoriData = [
    { kategori: 'PENDAPATAN' },
    { kategori: 'PEMBELIAN' },
    { kategori: 'BIAYA' },
  ];

  const subKategoriData = [
    // PENDAPATAN
    { sub_kategori: 'SOFTWARE', kategori: 'PENDAPATAN' },
    { sub_kategori: 'HARDWARE + CONSUMABLE', kategori: 'PENDAPATAN' },
    { sub_kategori: 'PENDAPATAN SUBSCRIBE', kategori: 'PENDAPATAN' },
    { sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },

    // PEMBELIAN
    { sub_kategori: 'SOFTWARE', kategori: 'PEMBELIAN' },
    { sub_kategori: 'HARDWARE', kategori: 'PEMBELIAN' },
    { sub_kategori: 'CONSUMABLE', kategori: 'PEMBELIAN' },
    { sub_kategori: 'LAIN LAIN', kategori: 'PEMBELIAN' },

    // BIAYA
    { sub_kategori: 'ASET', kategori: 'BIAYA' },
    { sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { sub_kategori: 'CICILAN GEDUNG', kategori: 'BIAYA' },
    { sub_kategori: 'GAJI', kategori: 'BIAYA' },
    { sub_kategori: 'IMPLEMENTASI', kategori: 'BIAYA' },
    { sub_kategori: 'MARKETING', kategori: 'BIAYA' },
    { sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { sub_kategori: 'PAJAK PPH 21', kategori: 'BIAYA' },
    { sub_kategori: 'BIAYA VPS', kategori: 'BIAYA' },
    { sub_kategori: 'BIAYA RND', kategori: 'BIAYA' },
    { sub_kategori: 'BPJS', kategori: 'BIAYA' },
    { sub_kategori: 'RETUR PENJUALAN', kategori: 'BIAYA' },
  ];

  const akunData = [
    // PENDAPATAN - SOFTWARE
    { akun: 'PENJUALAN', sub_kategori: 'SOFTWARE', kategori: 'PENDAPATAN' },
    { akun: 'PENJUALAN CASH NGTC', sub_kategori: 'SOFTWARE', kategori: 'PENDAPATAN' },
    { akun: 'PENJUALAN CASH GIA', sub_kategori: 'SOFTWARE', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN CUSTOM PROGRAM', sub_kategori: 'SOFTWARE', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN MAINTENANCE', sub_kategori: 'SOFTWARE', kategori: 'PENDAPATAN' },

    // PENDAPATAN - HARDWARE + CONSUMABLE
    { akun: 'HARDWARE + CONSUMABLE', sub_kategori: 'HARDWARE + CONSUMABLE', kategori: 'PENDAPATAN' },
    { akun: 'PENJUALAN CASH CV', sub_kategori: 'HARDWARE + CONSUMABLE', kategori: 'PENDAPATAN' },
    { akun: 'PENJUALAN KOTAK PERHIASAN', sub_kategori: 'HARDWARE + CONSUMABLE', kategori: 'PENDAPATAN' },

    // PENDAPATAN - PENDAPATAN SUBSCRIBE
    { akun: 'PENJUALAN CASH NAGANET', sub_kategori: 'PENDAPATAN SUBSCRIBE', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN SUBSCRIBE', sub_kategori: 'PENDAPATAN SUBSCRIBE', kategori: 'PENDAPATAN' },

    // PENDAPATAN - LAIN LAIN
    { akun: 'FEE PENJUALAN', sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN LAIN LAIN', sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },
    { akun: 'BUNGA BANK', sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN ATAS PENJUALAN ASET', sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN SERVICE', sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },
    { akun: 'PENDAPATAN JASA TEAM VIEWER', sub_kategori: 'LAIN LAIN', kategori: 'PENDAPATAN' },

    // PEMBELIAN - SOFTWARE
    { akun: 'SERVER', sub_kategori: 'SOFTWARE', kategori: 'PEMBELIAN' },
    { akun: 'SSL & DOMAIN', sub_kategori: 'SOFTWARE', kategori: 'PEMBELIAN' },

    // PEMBELIAN - HARDWARE
    { akun: 'HARDWARE', sub_kategori: 'HARDWARE', kategori: 'PEMBELIAN' },

    // PEMBELIAN - CONSUMABLE
    { akun: 'CONSUMABLE', sub_kategori: 'CONSUMABLE', kategori: 'PEMBELIAN' },

    // PEMBELIAN - LAIN LAIN
    { akun: 'BIAYA SERVICE', sub_kategori: 'LAIN LAIN', kategori: 'PEMBELIAN' },
    { akun: 'KOTAK PERHIASAN', sub_kategori: 'LAIN LAIN', kategori: 'PEMBELIAN' },
    { akun: 'HARDWARE + CONSUMABLE KE CV', sub_kategori: 'LAIN LAIN', kategori: 'PEMBELIAN' },

    // BIAYA - ASET
    { akun: 'ASET INVESTASI (CRYPTO, DLL)', sub_kategori: 'ASET', kategori: 'BIAYA' },
    { akun: 'ASET', sub_kategori: 'ASET', kategori: 'BIAYA' },
    { akun: 'CICILAN XPANDER', sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { akun: 'CICILAN CHERY J6', sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { akun: 'CICILAN CHERY TIGGO', sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { akun: 'CICILAN MOTOR PCX', sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { akun: 'CICILAN MOTOR NMAX', sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { akun: 'CICILAN MOBIL GMAX', sub_kategori: 'CICILAN KENDARAAN', kategori: 'BIAYA' },
    { akun: 'RUKO MTC', sub_kategori: 'CICILAN GEDUNG', kategori: 'BIAYA' },

    // BIAYA - GAJI
    { akun: 'GAJI', sub_kategori: 'GAJI', kategori: 'BIAYA' },
    { akun: 'INSENTIVE', sub_kategori: 'GAJI', kategori: 'BIAYA' },
    { akun: 'LEMBUR', sub_kategori: 'GAJI', kategori: 'BIAYA' },
    { akun: 'PIKET + U/M', sub_kategori: 'GAJI', kategori: 'BIAYA' },
    { akun: 'PESANGON', sub_kategori: 'GAJI', kategori: 'BIAYA' },
    { akun: 'BIAYA JASA CLEANING SERVICE', sub_kategori: 'GAJI', kategori: 'BIAYA' },

    // BIAYA - IMPLEMENTASI
    { akun: 'IMPLEMENTASI', sub_kategori: 'IMPLEMENTASI', kategori: 'BIAYA' },

    // BIAYA - MARKETING
    { akun: 'MARKETING', sub_kategori: 'MARKETING', kategori: 'BIAYA' },

    // BIAYA - LAIN LAIN
    { akun: 'LAIN LAIN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'ATK', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'B ASURANSI', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'BENSIN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'BEROBAT', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'BIAYA ADM BANK', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'BIAYA JASA KONSULTAN PAJAK', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'BIAYA SEWA GEDUNG', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'CHATGPT', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'DIGIFINANCE', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'ENTERTAIN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'FEE PENJUALAN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'INTERNET', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'JAMUAN TAMU/COMPLIMENT', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'KASBON', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'LINGKUNGAN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'LISTRIK', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'MAKAN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'MATERAI', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'ONGKIR', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'OPERASIONAL NETWORK', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PAJAK BUMI & BANGUNAN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PAJAK KENDARAAN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PENGEMBANGAN HRD', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PETTY CASH RUKO', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PETTY CASH SEMARANG', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PERJALANAN DINAS', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'PULSA', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'REPARASI KANTOR', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'REPARASI MOBIL', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'REPARASI MOTOR BEAT', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'REPARASI MOTOR PCX', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'RUKO', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'SERAGAM', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'SUMBANGAN', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },
    { akun: 'TEAM VIEWER', sub_kategori: 'LAIN LAIN', kategori: 'BIAYA' },

    // BIAYA - PAJAK PPH 21
    { akun: 'PAJAK PPH 21', sub_kategori: 'PAJAK PPH 21', kategori: 'BIAYA' },

    // BIAYA - BIAYA VPS
    { akun: 'BIAYA VPS/CLOUD', sub_kategori: 'BIAYA VPS', kategori: 'BIAYA' },

    // BIAYA - BIAYA RND
    { akun: 'BIAYA RISET', sub_kategori: 'BIAYA RND', kategori: 'BIAYA' },

    // BIAYA - BPJS
    { akun: 'BPJS', sub_kategori: 'BPJS', kategori: 'BIAYA' },

    // BIAYA - RETUR PENJUALAN
    { akun: 'RETUR PENJUALAN', sub_kategori: 'RETUR PENJUALAN', kategori: 'BIAYA' },
  ];

  // Seed Kategori
  for (const katData of kategoriData) {
    const existingKategori = await Kategori.findOne({ kategori: katData.kategori, status_aktv: true });
    if (!existingKategori) {
      const nextKode = await generateNextKode(Kategori);

      const newKategori = new Kategori({
        kategori: katData.kategori,
        kode: nextKode,
        status_aktv: true,
        input_date: new Date(),
        update_date: new Date(),
        delete_date: null,
        input_by: 'system',
        update_by: null,
        delete_by: null,
      });
      await newKategori.save();
      console.log(`✅ Created kategori: ${katData.kategori} with kode: ${nextKode}`);
    } else {
      console.log(`⏭️  Skipped existing kategori: ${katData.kategori}`);
    }
  }

  // Seed SubKategori
  for (const subKatData of subKategoriData) {
    const kategori = await Kategori.findOne({ kategori: subKatData.kategori, status_aktv: true });
    if (kategori) {
      const existingSubKategori = await SubKategori.findOne({
        sub_kategori: subKatData.sub_kategori,
        kategori: subKatData.kategori,
        status_aktv: true
      });
      if (!existingSubKategori) {
        const nextKode = await generateNextKode(SubKategori);

        const newSubKategori = new SubKategori({
          sub_kategori: subKatData.sub_kategori,
          kode: nextKode,
          kategori: subKatData.kategori,
          status_aktv: true,
          input_date: new Date(),
          update_date: new Date(),
          delete_date: null,
          input_by: 'system',
          update_by: null,
          delete_by: null,
        });
        await newSubKategori.save();
        console.log(`✅ Created sub_kategori: ${subKatData.sub_kategori} with kode: ${nextKode} under ${subKatData.kategori}`);
      } else {
        console.log(`⏭️  Skipped existing sub_kategori: ${subKatData.sub_kategori}`);
      }
    }
  }

  // Seed Akun
  for (const akunDataItem of akunData) {
    const subKategori = await SubKategori.findOne({
      sub_kategori: akunDataItem.sub_kategori,
      status_aktv: true
    });

    if (subKategori) {
      const existingAkun = await Akun.findOne({
        akun: akunDataItem.akun,
        sub_kategori: akunDataItem.sub_kategori,
        status_aktv: true
      });

      if (!existingAkun) {
        const nextKode = await generateNextKode(Akun);

        const newAkun = new Akun({
          sub_kategori: akunDataItem.sub_kategori,
          sub_kategori_kode: subKategori.kode,
          kategori: akunDataItem.kategori,
          akun: akunDataItem.akun,
          kode: nextKode,
          status_aktv: true,
          input_date: new Date(),
          update_date: new Date(),
          delete_date: null,
          input_by: 'system',
          update_by: null,
          delete_by: null,
        });

        await newAkun.save();
        console.log(`✅ Created akun: ${akunDataItem.akun} with kode: ${nextKode} under ${akunDataItem.sub_kategori}`);
      } else {
        console.log(`⏭️  Skipped existing akun: ${akunDataItem.akun}`);
      }
    }
  }
};
