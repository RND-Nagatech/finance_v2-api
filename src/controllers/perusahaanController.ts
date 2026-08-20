import { Request, Response } from 'express';
import Perusahaan from '../models/Perusahaan';

export const getAllPerusahaan = async (req: Request, res: Response) => {
  try {
    const perusahaan = await Perusahaan.find();
    res.json(perusahaan);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data perusahaan', error: err });
  }
};

export const createPerusahaan = async (req: Request, res: Response) => {
  try {
    const { kode_perusahaan, nama_perusahaan } = req.body;
    if (!kode_perusahaan || !nama_perusahaan) {
      return res.status(400).json({ message: 'Kode dan nama perusahaan wajib diisi' });
    }
    const exists = await Perusahaan.findOne({ kode_perusahaan });
    if (exists) {
      return res.status(400).json({ message: 'Kode perusahaan sudah terdaftar' });
    }
    const perusahaan = new Perusahaan({ kode_perusahaan, nama_perusahaan });
    await perusahaan.save();
    res.status(201).json({ message: 'Perusahaan berhasil ditambahkan', perusahaan });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menambah perusahaan', error: err });
  }
};

export const updatePerusahaan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { kode_perusahaan, nama_perusahaan } = req.body;
    const perusahaan = await Perusahaan.findByIdAndUpdate(
      id,
      { kode_perusahaan, nama_perusahaan },
      { new: true }
    );
    if (!perusahaan) {
      return res.status(404).json({ message: 'Perusahaan tidak ditemukan' });
    }
    res.json({ message: 'Perusahaan berhasil diupdate', perusahaan });
  } catch (err) {
    res.status(500).json({ message: 'Gagal update perusahaan', error: err });
  }
};

export const deletePerusahaan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const perusahaan = await Perusahaan.findByIdAndDelete(id);
    if (!perusahaan) {
      return res.status(404).json({ message: 'Perusahaan tidak ditemukan' });
    }
    res.json({ message: 'Perusahaan berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal hapus perusahaan', error: err });
  }
};
