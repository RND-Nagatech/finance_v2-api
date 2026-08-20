import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import TtFinanceDetail from '../models/TtFinanceDetail';
import TtSummaryV2 from '../models/TtSummaryV2';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRupiahSearch(input: string): number | null {
  if (!input) return null;
  const normalized = String(input)
    .replace(/rp/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '');
  if (!/^-?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function columnLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const SUMMARY_MONTH_NUMBER: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function buildSummaryYearMatchValue(tahun: any) {
  const yearNumber = Number(tahun);
  return Number.isFinite(yearNumber) ? { $in: [yearNumber, String(tahun)] } : tahun;
}

function buildSummaryMonthQuery(tahun: any, bulan: any) {
  if (!bulan) return null;
  const raw = String(bulan).trim().toUpperCase();
  const monthCode = raw.slice(0, 3);
  const monthNumber = SUMMARY_MONTH_NUMBER[monthCode];
  if (!monthNumber) return { bulan_fiskal_label: raw };

  const explicitYear = raw.match(/-(\d{2,4})$/);
  const yearNumber = explicitYear
    ? Number(explicitYear[1].length === 2 ? `20${explicitYear[1]}` : explicitYear[1])
    : Number(tahun);
  const labelYear = monthCode === 'DEC' && !explicitYear && Number.isFinite(yearNumber) ? yearNumber - 1 : yearNumber;
  const label = Number.isFinite(labelYear) ? `${monthCode}-${String(labelYear).slice(-2)}` : raw;

  return {
    $or: [
      { bulan_fiskal: monthNumber },
      { bulan_fiskal_label: label },
      { bulan_fiskal_label: raw },
    ],
  };
}

function resolveTransactionModeLabel(row: any): string {
  const mode = String(row?.transaction_mode || '').toUpperCase();
  if (mode === 'SPECIAL') return 'Khusus Rekening Only';
  if (mode === 'FINANCE_ONLY') return 'Khusus Dashboard Only';
  if (mode === 'NORMAL') return 'Normal';
  return row?.is_special_transaction ? 'Khusus Rekening Only' : 'Normal';
}

export const exportTransaksiExcel = async (req: Request, res: Response) => {
  try {
    const { from, to, nama_perusahaan, kategori, sub_kategori, akun, input_by, sortKategori, flatten, tahun, bulan, special_type, q } = req.query as any;

    const limit = Number(req.query.limit) || 10000;
    const doFlatten = String(flatten) === '1' || String(flatten).toLowerCase() === 'true';

    let rows: any[] = [];
    let header: string[] = [];

    if (doFlatten) {
      const filterAgg: any = { period_type: 'MONTHLY' };
      if (tahun) filterAgg.tahun_fiskal = buildSummaryYearMatchValue(tahun);
      if (kategori) filterAgg.kategori = kategori;
      if (sub_kategori) filterAgg.sub_kategori = sub_kategori;
      if (akun) filterAgg.akun = akun;
      if (input_by) rows = [];
      if (special_type && special_type !== 'NORMAL' && special_type !== 'ALL') rows = [];

      const sortStage: any = {};
      if (sortKategori === 'asc') sortStage.kategori = 1;
      else if (sortKategori === 'desc') sortStage.kategori = -1;
      sortStage.akun = 1;
      sortStage.sub_kategori = 1;
      sortStage.bulan_fiskal = 1;
      sortStage.bulan_fiskal_label = 1;

      const monthQuery = buildSummaryMonthQuery(tahun, bulan);
      if (monthQuery) Object.assign(filterAgg, monthQuery);

      const pipeline: any[] = [
        { $match: filterAgg },
        {
          $project: {
            kategori: 1,
            sub_kategori: 1,
            akun: 1,
            tahun_fiskal: 1,
            transaction_mode: { $literal: 'NORMAL' },
            is_special_transaction: { $literal: false },
            bulan: '$bulan_fiskal_label',
            nilai: '$total_nilai',
          }
        },
        ...(
          q && String(q).trim() !== ''
            ? (() => {
                const qText = String(q).trim();
                const qRegex = escapeRegex(qText);
                const qAmount = parseRupiahSearch(qText);
                return [{
                  $match: {
                    $or: [
                      { kategori: { $regex: qRegex, $options: 'i' } },
                      { sub_kategori: { $regex: qRegex, $options: 'i' } },
                      { akun: { $regex: qRegex, $options: 'i' } },
                      { bulan: { $regex: qRegex, $options: 'i' } },
                      ...(qAmount !== null ? [{ nilai: qAmount }] : []),
                    ],
                  },
                }];
              })()
            : []
        ),
        { $sort: sortStage },
        { $limit: limit }
      ];
      if (rows.length === 0 && !(input_by || (special_type && special_type !== 'NORMAL' && special_type !== 'ALL'))) {
        rows = await TtSummaryV2.aggregate(pipeline).allowDiskUse(true).exec();
      }
      // Rekap tidak perlu kolom Input By
      header = ['No', 'Jenis Transaksi', 'Kategori', 'Sub Kategori', 'Akun', 'Bulan Fiskal', 'Nilai', 'Tahun Fiskal'];
    } else {
      const filter: any = { status_deleted: { $ne: true } };
      const andFilters: any[] = [];
      if (from) filter.tanggal = { ...filter.tanggal, $gte: from };
      if (to) filter.tanggal = { ...filter.tanggal, $lte: to };
      if (nama_perusahaan) filter.nama_perusahaan = nama_perusahaan;
      if (kategori) filter.kategori = kategori;
      if (sub_kategori) filter.sub_kategori = sub_kategori;
      if (akun) filter.akun = akun;
      if (input_by) filter.input_by = input_by;
      if (special_type === 'SPECIAL') {
        andFilters.push({
          $or: [
            { transaction_mode: 'SPECIAL' },
            { transaction_mode: { $exists: false }, is_special_transaction: true }, // legacy data
          ],
        });
      }
      if (special_type === 'FINANCE_ONLY') filter.transaction_mode = 'FINANCE_ONLY';
      if (special_type === 'NORMAL') {
        andFilters.push({
          $or: [
            { transaction_mode: 'NORMAL' },
            { transaction_mode: { $exists: false }, is_special_transaction: { $ne: true } }, // legacy normal
          ],
        });
      }
      if (q && String(q).trim() !== '') {
        const qText = String(q).trim();
        const rx = new RegExp(escapeRegex(qText), 'i');
        const amount = parseRupiahSearch(qText);
        andFilters.push({
          $or: [
          { kategori: rx },
          { sub_kategori: rx },
          { akun: rx },
          { bulan: rx },
          { keterangan: rx },
          { input_by: rx },
          { nama_perusahaan: rx },
          ...(amount !== null ? [{ nilai: amount }] : []),
          ],
        });
      }
      if (andFilters.length > 0) {
        filter.$and = andFilters;
      }
      let sort: any = {};
      if (sortKategori === 'asc') sort.kategori = 1;
      if (sortKategori === 'desc') sort.kategori = -1;
      if (!sortKategori) sort.tanggal = 1;
      rows = await TtFinanceDetail.find(filter).sort(sort).limit(limit).lean();
      header = ['No', 'Tanggal', 'Jenis Transaksi', 'Kategori', 'Sub Kategori', 'Akun', 'Nilai', 'Keterangan', 'Input By', 'Perusahaan', 'No Rekening', 'Kode Bank', 'Bulan Fiskal'];
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transaksi');

    const lastCol = columnLetter(header.length);
    worksheet.mergeCells(`A1:${lastCol}1`);
    worksheet.getCell('A1').value = 'DATA TRANSAKSI';
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A1').font = { name: 'Calibri', bold: true, size: 14 };

    worksheet.mergeCells(`A2:${lastCol}2`);
    worksheet.getCell('A2').value = 'PT NAGATECH SISTEM INTEGRATOR';
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A2').font = { name: 'Calibri', bold: true, size: 14 };

    worksheet.mergeCells(`A3:${lastCol}3`);
    // Rekap tidak perlu header tanggal
    worksheet.getCell('A3').value = doFlatten
      ? ''
      : `Tanggal : ${from || ''}${from && to ? ' s/d ' : ''}${to || ''}`;
    worksheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A3').font = { name: 'Calibri', size: 12, bold: true };

    worksheet.addRow([]);
    worksheet.addRow(header);

    let totalNilai = 0;
    const dataStartRow = 6;
    let idx = 1;
    for (const row of rows) {
      const raw = row.nilai;
      let nilaiNum: number | null = null;
      if (typeof raw === 'number') nilaiNum = raw;
      else if (typeof raw === 'string') {
        const parsed = Number(String(raw).replace(/[^0-9.-]/g, ''));
        nilaiNum = isNaN(parsed) ? null : parsed;
      }
      if (typeof nilaiNum === 'number') totalNilai += nilaiNum;

      const values = doFlatten
        ? [
            idx,
            resolveTransactionModeLabel(row),
            row.kategori,
            row.sub_kategori,
            row.akun,
            row.bulan,
            typeof nilaiNum === 'number' ? nilaiNum : null,
            row.tahun_fiskal || ''
          ]
        : [
            idx,
            row.tanggal,
            resolveTransactionModeLabel(row),
            row.kategori,
            row.sub_kategori,
            row.akun,
            typeof nilaiNum === 'number' ? nilaiNum : null,
            row.keterangan,
            row.created_by || '',
            row.nama_perusahaan,
            row.no_rekening,
            row.kode_bank,
            row.bulan
          ];
      const added = worksheet.addRow(values);
      const nilaiColIndex = header.findIndex(h => h === 'Nilai') + 1;
      const nilaiCell = added.getCell(nilaiColIndex);
      if (typeof nilaiNum === 'number') nilaiCell.numFmt = '"Rp" \\ #,##0';
      idx++;
    }

    for (let r = 5; r <= worksheet.rowCount; r++) {
      const nilaiColIndex = header.findIndex(h => h === 'Nilai') + 1;
      const noColIndex = header.findIndex(h => h === 'No') + 1;
      worksheet.getRow(r).getCell(nilaiColIndex).alignment = { horizontal: 'right', vertical: 'middle' };
      if (noColIndex > 0) {
        worksheet.getRow(r).getCell(noColIndex).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    const dataEndRow = worksheet.rowCount;
    const totalRowIdx = dataEndRow + 1;
    // Total row cells must match header length
    const totalRowValues = Array(header.length).fill('');
    totalRowValues[0] = 'TOTAL';
    // Set placeholder for 'Nilai' column
    const nilaiColIndex = header.findIndex(h => h === 'Nilai') + 1;
    totalRowValues[nilaiColIndex - 1] = null;
    worksheet.addRow(totalRowValues);
    worksheet.mergeCells(`A${totalRowIdx}:D${totalRowIdx}`);
    const totalRow = worksheet.getRow(totalRowIdx);
    const totalCell = totalRow.getCell(nilaiColIndex);
    const nilaiColLetter = columnLetter(nilaiColIndex);
    totalCell.value = { formula: `SUM(${nilaiColLetter}${dataStartRow}:${nilaiColLetter}${dataEndRow})`, result: totalNilai };
    totalCell.numFmt = '"Rp" \\ #,##0';
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 12, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0E0E0' } };
      if (colNumber === nilaiColIndex || colNumber === 1) cell.alignment = { horizontal: 'right', vertical: 'middle' };
      else cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    const headerRow = worksheet.getRow(5);
    headerRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 12, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7BB8FF' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 5 && rowNumber !== totalRowIdx) {
        row.eachCell(cell => {
          if (rowNumber === 5) cell.font = { name: 'Calibri', size: 12, bold: true };
          else cell.font = { name: 'Calibri', size: 11 };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
      }
    });

    for (const col of worksheet.columns) {
      if (!col) continue;
      let maxLength = 5;
      (col as any).eachCell({ includeEmpty: true }, (cell: any) => {
        const val = cell.value ? String(cell.value) : '';
        if (val.length > maxLength) maxLength = val.length;
      });
      col.width = Math.min(Math.max(maxLength + 1, 5), 22);
    }

    // Make 'No' column narrower and centered
    const noColIndex = header.findIndex(h => h === 'No') + 1;
    if (noColIndex > 0) {
      const maxNoDigits = String(rows.length).length;
      worksheet.getColumn(noColIndex).width = Math.max(maxNoDigits + 1, 3);
      worksheet.getColumn(noColIndex).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=transaksi.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: 'Gagal export excel', error: err });
  }
};
