import { Request, Response } from 'express';
import Bank from '../models/Bank';

export const getAllBanks = async (req: Request, res: Response) => {
  try {
    const banks = await Bank.find();
    res.json(banks);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data bank.' });
  }
};

export const getBankById = async (req: Request, res: Response) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) return res.status(404).json({ message: 'Bank tidak ditemukan.' });
    res.json(bank);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data bank.' });
  }
};

export const createBank = async (req: Request, res: Response) => {
  try {
    const { kode_bank, nama_bank } = req.body;
    const bank = new Bank({ kode_bank, nama_bank });
    await bank.save();
    res.status(201).json(bank);
  } catch (err) {
    res.status(400).json({ message: 'Gagal menambah bank.' });
  }
};

export const updateBank = async (req: Request, res: Response) => {
  try {
    const { kode_bank, nama_bank } = req.body;
    const bank = await Bank.findByIdAndUpdate(
      req.params.id,
      { kode_bank, nama_bank },
      { new: true }
    );
    if (!bank) return res.status(404).json({ message: 'Bank tidak ditemukan.' });
    res.json(bank);
  } catch (err) {
    res.status(400).json({ message: 'Gagal update bank.' });
  }
};

export const deleteBank = async (req: Request, res: Response) => {
  try {
    const bank = await Bank.findByIdAndDelete(req.params.id);
    if (!bank) return res.status(404).json({ message: 'Bank tidak ditemukan.' });
    res.json({ message: 'Bank berhasil dihapus.' });
  } catch (err) {
    res.status(400).json({ message: 'Gagal hapus bank.' });
  }
};
