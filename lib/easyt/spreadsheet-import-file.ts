import * as XLSX from "xlsx";
import {
  SPREADSHEET_IMPORT_LIMITS,
  spreadsheetColumnMappings,
  tableFromRows,
  type SpreadsheetCell,
  type SpreadsheetTable,
} from "./spreadsheet-import.ts";

export type SpreadsheetWorkbookResult = {
  sheets: SpreadsheetTable[];
};

export function parseSpreadsheetWorkbook(data: ArrayBuffer, fileName: string): SpreadsheetWorkbookResult {
  if (data.byteLength > SPREADSHEET_IMPORT_LIMITS.fileBytes) throw new Error("The file is larger than the 5 MB V1 limit.");
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, {
      type: "array",
      bookVBA: false,
      bookFiles: false,
      bookDeps: false,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false,
      sheetRows: SPREADSHEET_IMPORT_LIMITS.rows + 2,
      WTF: false,
    });
  } catch {
    throw new Error("Morrovia could not read this XLSX file. Save it again as XLSX or CSV and retry.");
  }
  const visibility = workbook.Workbook?.Sheets ?? [];
  const visibleNonEmptySheets: SpreadsheetTable[] = [];
  workbook.SheetNames.forEach((name, index) => {
    if ((visibility[index]?.Hidden ?? 0) !== 0) return;
    const sheet = workbook.Sheets[name];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range((sheet["!fullref"] as string | undefined) ?? sheet["!ref"]);
    if (range.e.c - range.s.c + 1 > SPREADSHEET_IMPORT_LIMITS.columns) throw new Error(`“${name}” has more than ${SPREADSHEET_IMPORT_LIMITS.columns} columns.`);
    if (range.e.r - range.s.r > SPREADSHEET_IMPORT_LIMITS.rows) throw new Error(`“${name}” has more than ${SPREADSHEET_IMPORT_LIMITS.rows} data rows.`);
    const rows = XLSX.utils.sheet_to_json<SpreadsheetCell[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
    try {
      visibleNonEmptySheets.push(tableFromRows(name, rows));
    } catch (error) {
      if (!(error instanceof Error) || !/blank|headers but no trip rows/i.test(error.message)) throw error;
    }
  });
  if (!visibleNonEmptySheets.length) throw new Error(`${fileName} has no visible, non-empty worksheet with trip rows.`);
  const sheets = visibleNonEmptySheets.filter((sheet) => sheet.headers.length >= 2
    && spreadsheetColumnMappings(sheet.headers).some((mapping) => mapping.state !== "ignored"));
  if (!sheets.length) throw new Error(`${fileName} has visible worksheets, but none has a plausible tabular trip structure.`);
  return { sheets };
}
