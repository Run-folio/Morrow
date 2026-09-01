import * as XLSX from "xlsx";

export const simpleDestinationDateCsv = `Destination,Arrival date,Departure date
Tokyo,2027-04-02,2027-04-06
Kyoto,2027-04-06,2027-04-10`;

export const richTripCsv = `Destination,Country,Arrival date,Departure date,Nights,Hotel,Transport,From,To,Transport date,Activity,Activity date,Booking reference,Notes,Trip origin
Tokyo,Japan,2027-04-02,2027-04-06,4,Hotel Niwa,,,,,,,STAY-TYO-1,Quiet room,London
Tokyo,Japan,2027-04-02,2027-04-06,,,,,,,Senso-ji,2027-04-03,,Morning visit,London
Kyoto,Japan,2027-04-06,2027-04-10,4,The Gate Hotel,,,,,,,STAY-KYO-1,,London
Kyoto,Japan,2027-04-06,2027-04-10,,,Train,Tokyo,Kyoto,2027-04-06,,,JR-42,Reserved seats,London
Kyoto,Japan,2027-04-06,2027-04-10,,,,,,,Fushimi Inari,2027-04-08,,Go early,London`;

export const cleanFiveStopTripCsv = `Trip origin,Destination,Country,Arrival date,Departure date,Nights,Accommodation,Booking reference,Transport mode,From,To,Transport date,Activity,Activity date,Transport reference,Travel ideas
London,Lisbon,Portugal,2027-05-01,2027-05-04,3,Lumiares Hotel,LIS-01,Flight,London,Lisbon,2027-05-01,Belém Tower,2027-05-02,TP-101,
London,Lisbon,Portugal,2027-05-01,2027-05-04,3,,,,,,,Alfama walk,2027-05-03,,
London,Porto,Portugal,2027-05-04,2027-05-06,2,Torel Avantgarde,POR-02,Train,Lisbon,Porto,2027-05-04,Livraria Lello,2027-05-04,IC-721,
London,Porto,Portugal,2027-05-04,2027-05-06,2,,,,,,,Douro river cruise,2027-05-05,,
London,Madrid,Spain,2027-05-06,2027-05-09,3,Only YOU Boutique Hotel,MAD-03,Flight,Porto,Madrid,2027-05-06,Prado Museum,2027-05-07,IB-309,
London,Madrid,Spain,2027-05-06,2027-05-09,3,,,,,,,El Retiro Park,2027-05-08,,
London,Barcelona,Spain,2027-05-09,2027-05-12,3,Stay H10 Madison,BCN-04,Train,Madrid,Barcelona,2027-05-09,Sagrada Família,2027-05-10,AVE-512,
London,Barcelona,Spain,2027-05-09,2027-05-12,3,,,,,,,Gothic Quarter food tour,2027-05-11,,
London,Nice,France,2027-05-12,2027-05-15,3,Hotel Apollinaire Nice,NCE-05,Flight,Barcelona,Nice,2027-05-12,Old Nice and Castle Hill,2027-05-13,VY-1512,
London,Nice,France,2027-05-12,2027-05-15,3,,,,,,,Èze half-day trip,2027-05-14,,`;

export const pastedGoogleSheetsTable = `City\tStart date\tEnd date\tNights\tComments
Lisbon\t2027-05-01\t2027-05-04\t3\tAnniversary dinner
Porto\t2027-05-04\t2027-05-07\t3\tRiver day`;

export const messySpreadsheetCsv = `  STOP  ,Start Date,END DATE,NIGHTS,Unused budget idea,Comments

Tokyo,2027-04-02,2027-04-06,4,£200,Near Ueno
Kyoto,2027-04-06,2027-04-10,4,,
,,,,,`;

export const ambiguousDateCsv = `Destination,Arrival date,Departure date
Paris,04/05/2027,09/05/2027`;

export const duplicateTripCsv = `Destination,Country,Arrival date,Departure date,Hotel,Booking reference
Rome,Italy,2027-06-01,2027-06-04,Hotel Artemide,ROM-42
Rome,Italy,2027-06-01,2027-06-04,Hotel Artemide,ROM-42
Rome,Italy,2027-06-01,2027-06-04,Hotel Artemide,ROM-42`;

export const partiallyUnmappableCsv = `Place,Arrival date,Departure date,Maybe,Freeform wish
Osaka,2027-09-01,2027-09-04,?,Find a tiny jazz bar
,2027-09-04,2027-09-05,?,No destination supplied`;

export function richTripXlsxFixture() {
  const rows = richTripCsv.split("\n").map((row) => row.split(","));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Trip plan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Notes"], ["Unrelated packing list"]]), "Packing");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["City", "Start date", "End date"], ["Seoul", "2027-07-01", "2027-07-05"]]), "Alternate plan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Secret"], ["Hidden sheet"]]), "Hidden");
  workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] };
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function cachedFormulaXlsxFixture() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["Destination", "Arrival date", "Nights"], ["Madrid", "2027-03-01", 4]]);
  sheet.C2 = { t: "n", v: 4, f: "2+2" };
  XLSX.utils.book_append_sheet(workbook, sheet, "Trip");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
