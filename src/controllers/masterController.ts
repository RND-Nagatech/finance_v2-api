
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Kategori, { IKategori } from '../models/Kategori';
import SubKategori, { ISubKategori } from '../models/SubKategori';
import Akun, { IAkun } from '../models/Akun';
import TtFinanceDetail from '../models/TtFinanceDetail';


// Resolve acting user from authenticated request only. Ignore client-supplied audit fields.
const resolveUserId = (req: Request) => {
  if (req.user && typeof req.user === 'object') {
    return (req.user as any).name || (req.user as any).username || (req.user as any).id || (req.user as any)._id || 'system';
  }
  if (typeof req.user === 'string' && req.user.length > 0) return req.user;
  return 'system';
};

// Return audit user id (prefer numeric/id fields). Used for deleted_by/deleted_at fields.
const getAuditUserId = (req: Request) => {
  if (req.user && typeof req.user === 'object') {
    return String((req.user as any).id || (req.user as any)._id || (req.user as any).username || (req.user as any).name);
  }
  return 'system';
};

// Helper function to generate next kode from the highest numeric kode in the collection.
const generateNextKode = async (model: any, field = 'kode'): Promise<string> => {
  const [lastDoc] = await model.aggregate([
    {
      $addFields: {
        kode_number: {
          $convert: {
            input: `$${field}`,
            to: 'int',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { kode_number: { $ne: null } } },
    { $sort: { kode_number: -1 } },
    { $limit: 1 },
    { $project: { kode_number: 1 } },
  ]);

  const lastNum = Number(lastDoc?.kode_number || 0);
  const nextNum = lastNum + 1;
  return nextNum.toString().padStart(3, '0');
};

export const createKategori = async (req: Request, res: Response) => {
  try {
    const { kategori } = req.body;
    if (!kategori) return res.status(400).json({ message: 'kategori required' });
    const userId = resolveUserId(req);
    const finalKode = await generateNextKode(Kategori);
    const k = new Kategori({
      kategori,
      kode: finalKode,
      input_date: new Date(),
      update_date: new Date(),
      delete_date: null,
      input_by: userId,
      update_by: null,
      delete_by: null,
    });

    await k.save();
    res.status(200).json({ success: true, message: 'Data berhasil disimpan.', data: k });
  } catch (error) {
    console.error('❌ Error in createKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateKategori = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { kategori, kode } = req.body;
    const userId = resolveUserId(req);

    const old = await Kategori.findById(id);
    if (!old) return res.status(404).json({ message: 'Kategori not found' });

    // kode uniqueness check (exclude current)
    if (kode) {
      const existsKode = await Kategori.findOne({ _id: { $ne: id }, kode, status_aktv: true });
      if (existsKode) {
        return res.status(400).json({ message: 'Kode kategori tersebut sudah digunakan. Silakan gunakan kode lain.' });
      }
    }

    old.kategori = kategori ?? old.kategori;
    old.kode = kode ?? old.kode;
    old.update_date = new Date();
    old.update_by = userId;
    old.status_aktv = req.body.status_aktv ?? old.status_aktv;
    await old.save();
    res.status(200).json({ success: true, message: 'Data berhasil disimpan.', data: old });
  } catch (error) {
    console.error('❌ Error in updateKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


// ==================== KATEGORI ====================

export const listKategori = async (req: Request, res: Response) => {
  try {
    let filter = {};
    if (!req.query.all) {
      filter = { status_aktv: true };
    };
    const list = await Kategori.find(filter).sort({ kategori: 1 });
    res.json(list);
  } catch (error) {
    console.error('❌ Error in listKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const deleteKategori = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);

    const kategori = await Kategori.findById(id);
    if (!kategori) return res.status(404).json({ message: 'Kategori not found' });
    // 1) Check active subkategori referencing this kategori
    const activeSubCount = await SubKategori.countDocuments({
      kategori: kategori.kategori,
      status_aktv: true,
    });
    if (activeSubCount > 0) {
      return res.status(400).json({ message: 'Kategori tidak dapat dihapus karena masih memiliki sub kategori yang aktif.' });
    }

    // 2) Check active akun referencing this kategori (via Akun.kategori)
    const activeAkunCount = await Akun.countDocuments({
      kategori: kategori.kategori,
      status_aktv: true,
    });
    if (activeAkunCount > 0) {
      return res.status(400).json({ message: 'Kategori tidak dapat dihapus karena masih memiliki akun aktif yang terhubung.' });
    }

    // 3) Check for transactions referencing this kategori
    const detailTrx = await TtFinanceDetail.findOne({ kategori: { $in: [kategori.kategori, String(kategori._id)] } });
    if (detailTrx) {
      return res.status(400).json({ message: 'Kategori tidak dapat dihapus karena masih terdapat transaksi yang mereferensikannya.' });
    }

    const auditUser = getAuditUserId(req);
    kategori.status_aktv = false;
    kategori.delete_date = new Date();
    kategori.delete_by = auditUser;
    await kategori.save();
    res.status(200).json({ success: true, message: 'Kategori berhasil dihapus.', data: kategori });
  } catch (error) {
    console.error('❌ Error in deleteKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// ...existing code...

// ...existing code...

// ==================== SUBKATEGORI ====================
export const createSubKategori = async (req: Request, res: Response) => {
  try {
    const { sub_kategori, kategori } = req.body;
    if (!sub_kategori || !kategori) return res.status(400).json({ message: 'sub_kategori & kategori required' });
    const userId = resolveUserId(req);
    const finalKode = await generateNextKode(SubKategori);

    // Jika belum ada, insert baru
    const s = new SubKategori({
      sub_kategori,
      kode: finalKode,
      kategori,
      status_aktv: true,
      input_date: new Date(),
      update_date: new Date(),
      delete_date: null,
      input_by: userId,
      update_by: null,
      delete_by: null,
    });

    await s.save();
    res.status(200).json({ success: true, message: 'Data berhasil disimpan.', data: s });
  } catch (error) {
    console.error('❌ Error in createSubKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const listSubKategori = async (req: Request, res: Response) => {
  try {
    const { kategori } = req.query;
    const filter: any = {};
    if (kategori) {
      filter.kategori = kategori;
    }

    const list = await SubKategori.find({ ...filter, status_aktv: true }).sort({ sub_kategori: 1 });

    const formatted = list.map((s) => ({
      _id: s._id,
      sub_kategori: s.sub_kategori,
      kode: s.kode,
      kategori: s.kategori,
      input_date: s.input_date,
      update_date: s.update_date,
      delete_date: s.delete_date,
      input_by: s.input_by,
      update_by: s.update_by,
      delete_by: s.delete_by,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('❌ Error in listSubKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};


export const updateSubKategori = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sub_kategori, kode, kategori } = req.body;
    const userId = resolveUserId(req);

    // Ambil sub_kategori lama
    const oldSubKategori = await SubKategori.findById(id);
    if (!oldSubKategori) return res.status(404).json({ message: 'SubKategori not found' });

    // kode uniqueness check (exclude current)
    if (kode) {
      const kodeExists = await SubKategori.findOne({ _id: { $ne: id }, kode, status_aktv: true });
      if (kodeExists) {
        return res.status(400).json({ message: 'Kode sub kategori tersebut sudah digunakan. Silakan gunakan kode lain.' });
      }
    }

    const s = await SubKategori.findByIdAndUpdate(
      id,
      { sub_kategori, kode, kategori, update_date: new Date(), update_by: userId, status_aktv: req.body.status_aktv ?? true },
      { new: true }
    );

    if (!s) return res.status(404).json({ message: 'SubKategori not found' });
    // Update relasi akun: ganti semua akun yang punya sub_kategori lama ke sub_kategori baru
    await Akun.updateMany({ sub_kategori: oldSubKategori.sub_kategori }, { sub_kategori });
    res.json(s);
  } catch (error) {
    console.error('❌ Error in updateSubKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const deleteSubKategori = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);
    const subkategori = await SubKategori.findById(id);
    if (!subkategori) return res.status(404).json({ message: 'SubKategori not found' });
    // 1) Check active akun referencing this subkategori
    const activeAkunCount = await Akun.countDocuments({
      sub_kategori: subkategori.sub_kategori,
      status_aktv: true,
    });
    if (activeAkunCount > 0) {
      return res.status(400).json({ message: 'Sub kategori tidak dapat dihapus karena masih memiliki akun aktif.' });
    }

    // 2) Check transactions referencing this subkategori
    const detailTrx = await TtFinanceDetail.findOne({ sub_kategori: { $in: [subkategori.sub_kategori, String(subkategori._id)] } });
    if (detailTrx) {
      return res.status(400).json({ message: 'Sub kategori tidak dapat dihapus karena masih terdapat transaksi yang mereferensikannya.' });
    }

    const auditUser = getAuditUserId(req);
    subkategori.status_aktv = false;
    subkategori.delete_date = new Date();
    subkategori.delete_by = auditUser;
    await subkategori.save();
    res.status(200).json({ success: true, message: 'Sub kategori berhasil dihapus.', data: subkategori });
  } catch (error) {
    console.error('❌ Error in deleteSubKategori:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// ==================== AKUN ====================

export const listAkun = async (req: Request, res: Response) => {
  try {
    const { sub_kategori } = req.query;
    const filter: any = {};
    if (sub_kategori) {
      filter.sub_kategori = sub_kategori;
    }

    // Ambil data akun dan join sub kategori agar dapat _id
    const akunList = await Akun.find({ ...filter, status_aktv: true }).sort({ akun: 1 });
    // Cari sub kategori berdasarkan nama untuk dapatkan _id
    const subKategoriAll = await SubKategori.find({});
    const list = akunList.map((a) => {
      const subKategoriObj = subKategoriAll.find(
        (sub) => sub.sub_kategori === a.sub_kategori
      );
      return {
        ...a.toObject(),
        subkategori_id: subKategoriObj ? subKategoriObj._id : '',
      };
    });
    res.json(list);
  } catch (error) {
    console.error('❌ Error in listAkun:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const createAkun = async (req: Request, res: Response) => {
  try {
    const { sub_kategori, akun } = req.body;
    if (!sub_kategori || !akun) return res.status(400).json({ message: 'sub_kategori & akun required' });
    const userId = resolveUserId(req);
    const finalKode = await generateNextKode(Akun);

    // sub_kategori dikirim sebagai _id, ambil semua relasi sub kategori
    let subKategoriNama = sub_kategori;
    let subKategoriId = null;
    let subKategoriKode = '';
    let kategoriNama = '';
    if (mongoose.Types.ObjectId.isValid(sub_kategori)) {
      const subKategoriDoc = await SubKategori.findById(sub_kategori);
      if (!subKategoriDoc) return res.status(400).json({ message: 'SubKategori tidak ditemukan' });
      subKategoriNama = subKategoriDoc.sub_kategori;
      subKategoriId = subKategoriDoc._id;
      subKategoriKode = subKategoriDoc.kode;
      kategoriNama = subKategoriDoc.kategori;
    }

    const a = new Akun({
      sub_kategori: subKategoriNama,
      sub_kategori_id: subKategoriId,
      sub_kategori_kode: subKategoriKode,
      kategori: kategoriNama,
      akun,
      kode: finalKode,
      input_date: new Date(),
      update_date: new Date(),
      delete_date: null,
      input_by: userId,
      update_by: null,
      delete_by: null,
    });

    await a.save();
    res.status(200).json({ success: true, message: 'Data berhasil disimpan.', data: a });
  } catch (error) {
    console.error('\u274c Error in createAkun:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateAkun = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sub_kategori, akun, kode } = req.body;
    const userId = resolveUserId(req);

    // Ambil akun lama
    const oldAkun = await Akun.findById(id);
    if (!oldAkun) return res.status(404).json({ message: 'Akun not found' });

    // sub_kategori dikirim sebagai _id, ambil nama sub kategori
    let subKategoriNama = oldAkun.sub_kategori;
    if (sub_kategori !== undefined) {
      subKategoriNama = sub_kategori;
      if (mongoose.Types.ObjectId.isValid(sub_kategori)) {
        const subKategoriDoc = await SubKategori.findById(sub_kategori);
        if (!subKategoriDoc) return res.status(400).json({ message: 'SubKategori tidak ditemukan' });
        subKategoriNama = subKategoriDoc.sub_kategori;
      }
    }

    const a = await Akun.findByIdAndUpdate(
      id,
      {
        sub_kategori: subKategoriNama,
        akun: akun ?? oldAkun.akun,
        kode: kode ?? oldAkun.kode,
        update_date: new Date(),
        update_by: userId,
        status_aktv: req.body.status_aktv ?? true
      },
      { new: true }
    );

    if (!a) return res.status(404).json({ message: 'Akun not found' });
    res.status(200).json({ success: true, message: 'Data berhasil disimpan.', data: a });
  } catch (error) {
    console.error('\u274c Error in updateAkun:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const deleteAkun = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);

    const akun = await Akun.findById(id);
    if (!akun) return res.status(404).json({ message: 'Akun not found' });
    // Check transactions referencing this akun (by id or by string)
    const akunValues = [akun._id, String(akun._id), akun.akun, String(akun.akun)];
    const detailTrx = await TtFinanceDetail.findOne({ akun: { $in: akunValues } });
    if (detailTrx) {
      return res.status(400).json({ message: 'Akun tidak dapat dihapus karena sudah digunakan di transaksi.' });
    }

    const auditUser = getAuditUserId(req);
    akun.status_aktv = false;
    akun.delete_date = new Date();
    akun.delete_by = auditUser;
    await akun.save();
    res.status(200).json({ success: true, message: 'Akun berhasil dihapus.', data: akun });
  } catch (error) {
    console.error('❌ Error in deleteAkun:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};
