import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Rekening from '../models/Rekening';
import Bank from '../models/Bank';
import Perusahaan from '../models/Perusahaan';
import RekeningTransfer from '../models/RekeningTransfer';

const normalizePerusahaanIds = (body: any): string[] => {
  const raw = Array.isArray(body?.perusahaan_ids)
    ? body.perusahaan_ids
    : Array.isArray(body?.perusahaan_id)
      ? body.perusahaan_id
      : body?.perusahaan_id
        ? [body.perusahaan_id]
        : [];

  return Array.from(new Set(raw.map((id: any) => String(id || '').trim()).filter(Boolean)));
};

const resolvePerusahaanSelection = async (ids: string[]) => {
  if (ids.length === 0) return [];

  const invalidId = ids.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) {
    throw new Error('Perusahaan tidak ditemukan.');
  }

  const perusahaans = await Perusahaan.find({ _id: { $in: ids } });
  if (perusahaans.length !== ids.length) {
    throw new Error('Perusahaan tidak ditemukan.');
  }

  return ids
    .map((id) => perusahaans.find((p: any) => String(p._id) === id))
    .filter(Boolean) as any[];
};

export const getAllRekenings = async (req: Request, res: Response) => {
  try {
    const rekenings = await Rekening.find().populate('bank_id').populate('perusahaan_id').populate('perusahaan_ids');
    res.json(rekenings);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data rekening.' });
  }
};

export const getRekeningById = async (req: Request, res: Response) => {
  try {
    const rekening = await Rekening.findById(req.params.id).populate('bank_id').populate('perusahaan_id').populate('perusahaan_ids');
    if (!rekening) return res.status(404).json({ message: 'Rekening tidak ditemukan.' });
    res.json(rekening);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data rekening.' });
  }
};


export const createRekening = async (req: Request, res: Response) => {
  try {
    const { bank_id, no_rekening, nama_rekening, saldo } = req.body;
    // Cari kode_bank dari bank_id
    const bank = await Bank.findById(bank_id);
    if (!bank) return res.status(400).json({ message: 'Bank tidak ditemukan.' });
    const perusahaans = await resolvePerusahaanSelection(normalizePerusahaanIds(req.body));
    const primaryPerusahaan = perusahaans[0] || null;
    const rekening = new Rekening({
      bank_id,
      perusahaan_id: primaryPerusahaan?._id || null,
      perusahaan_ids: perusahaans.map((p) => p._id),
      kode_perusahaan: perusahaans.map((p) => p.kode_perusahaan).join(', '),
      nama_perusahaan: perusahaans.map((p) => p.nama_perusahaan).join(', '),
      kode_bank: bank.kode_bank,
      no_rekening,
      nama_rekening,
      saldo: saldo || 0
    });
    await rekening.save();
    res.status(201).json(rekening);
  } catch (err: any) {
    res.status(400).json({ message: err?.message || 'Gagal menambah rekening.' });
  }
};


export const updateRekening = async (req: Request, res: Response) => {
  try {
    const { bank_id, no_rekening, nama_rekening, saldo } = req.body;
    // Cari kode_bank dari bank_id
    const bank = await Bank.findById(bank_id);
    if (!bank) return res.status(400).json({ message: 'Bank tidak ditemukan.' });
    const perusahaans = await resolvePerusahaanSelection(normalizePerusahaanIds(req.body));
    const primaryPerusahaan = perusahaans[0] || null;
    const rekening = await Rekening.findByIdAndUpdate(
      req.params.id,
      {
        bank_id,
        perusahaan_id: primaryPerusahaan?._id || null,
        perusahaan_ids: perusahaans.map((p) => p._id),
        kode_perusahaan: perusahaans.map((p) => p.kode_perusahaan).join(', '),
        nama_perusahaan: perusahaans.map((p) => p.nama_perusahaan).join(', '),
        kode_bank: bank.kode_bank,
        no_rekening,
        nama_rekening,
        saldo: saldo || 0,
      },
      { new: true }
    );
    if (!rekening) return res.status(404).json({ message: 'Rekening tidak ditemukan.' });
    res.json(rekening);
  } catch (err: any) {
    res.status(400).json({ message: err?.message || 'Gagal update rekening.' });
  }
};

export const deleteRekening = async (req: Request, res: Response) => {
  try {
    const rekening = await Rekening.findByIdAndDelete(req.params.id);
    if (!rekening) return res.status(404).json({ message: 'Rekening tidak ditemukan.' });
    res.json({ message: 'Rekening berhasil dihapus.' });
  } catch (err) {
    res.status(400).json({ message: 'Gagal hapus rekening.' });
  }
};

export const transferSaldoAntarRekening = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const {
      from_rekening_id,
      to_rekening_id,
      nominal,
      tanggal,
      keterangan,
    } = req.body || {};

    if (!from_rekening_id || !to_rekening_id || nominal === undefined || nominal === null) {
      return res.status(400).json({ message: 'from_rekening_id, to_rekening_id, dan nominal wajib diisi.' });
    }

    if (String(from_rekening_id) === String(to_rekening_id)) {
      return res.status(400).json({ message: 'Rekening sumber dan tujuan tidak boleh sama.' });
    }

    const amount = Number(nominal);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Nominal transfer harus lebih besar dari 0.' });
    }

    const transferDate = tanggal ? new Date(String(tanggal)) : new Date();
    if (Number.isNaN(transferDate.getTime())) {
      return res.status(400).json({ message: 'Tanggal transfer tidak valid.' });
    }

    let fromAfter: number = 0;
    let toAfter: number = 0;

    await session.withTransaction(async () => {
      const [fromRekening, toRekening] = await Promise.all([
        Rekening.findById(from_rekening_id).session(session),
        Rekening.findById(to_rekening_id).session(session),
      ]);

      if (!fromRekening || !toRekening) {
        throw new Error('Rekening sumber/tujuan tidak ditemukan.');
      }

      const fromBefore = Number(fromRekening.saldo || 0);
      const toBefore = Number(toRekening.saldo || 0);

      if (fromBefore < amount) {
        throw new Error('Saldo rekening sumber tidak mencukupi.');
      }

      fromAfter = fromBefore - amount;
      toAfter = toBefore + amount;

      fromRekening.saldo = fromAfter;
      toRekening.saldo = toAfter;

      await Promise.all([
        fromRekening.save({ session }),
        toRekening.save({ session }),
      ]);

      await RekeningTransfer.create([{
        from_rekening_id: fromRekening._id,
        to_rekening_id: toRekening._id,
        from_kode_bank: fromRekening.kode_bank,
        from_no_rekening: fromRekening.no_rekening,
        to_kode_bank: toRekening.kode_bank,
        to_no_rekening: toRekening.no_rekening,
        nominal: amount,
        tanggal: transferDate,
        keterangan: String(keterangan || '').trim(),
        created_by: String((req as any)?.user?.username || (req as any)?.user?.name || (req as any)?.user?.email || 'SYSTEM'),
        created_at: new Date(),
      }], { session });
    });

    return res.status(200).json({
      success: true,
      message: 'Transfer saldo antar rekening berhasil.',
      data: {
        from_rekening_id,
        to_rekening_id,
        nominal: amount,
        from_saldo_akhir: fromAfter,
        to_saldo_akhir: toAfter,
        tanggal: transferDate,
      },
    });
  } catch (err: any) {
    const msg = err?.message || 'Gagal transfer saldo antar rekening.';
    if (
      msg.includes('tidak ditemukan') ||
      msg.includes('mencukupi')
    ) {
      return res.status(400).json({ message: msg });
    }
    return res.status(500).json({ message: msg });
  } finally {
    session.endSession();
  }
};
