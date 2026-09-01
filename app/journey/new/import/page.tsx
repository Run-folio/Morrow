import EasyTNavigation from "../../easyt-navigation";
import SpreadsheetImportClient from "./spreadsheet-import-client";
import styles from "./spreadsheet-import.module.css";

export default function SpreadsheetImportPage() {
  return (
    <main className={`${styles.page} morrovia-editorial-page`}>
      <EasyTNavigation current="new" />
      <SpreadsheetImportClient />
    </main>
  );
}
