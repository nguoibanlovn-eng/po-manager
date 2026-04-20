import "server-only";
import { uploadShopeeCsv } from "@/lib/shopee/csv-upload";

const FOLDER_ID = "1db_i8Ey9WOKwrcSyjl64y6YhTKySghZ1";

type DriveFile = { id: string; name: string; date: string; shop: string };

/** List subfolders (Levu, Velasboost) and their CSV files */
async function listShopFolders(): Promise<{ id: string; name: string }[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}&hl=en`;
  const res = await fetch(url);
  const html = await res.text();
  const folders: { id: string; name: string }[] = [];
  const entries = html.split('class="flip-entry"');
  for (const entry of entries) {
    const idMatch = entry.match(/id="entry-([a-zA-Z0-9_-]{20,})"/);
    const nameMatch = entry.match(/flip-entry-title">([^<]+)/);
    if (idMatch && nameMatch) {
      folders.push({ id: idMatch[1], name: decodeURIComponent(nameMatch[1].replace(/\+/g, " ")) });
    }
  }
  return folders;
}

/** List CSV files in a shop subfolder */
async function listFilesInFolder(folderId: string, shopName: string): Promise<DriveFile[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}&hl=en`;
  const res = await fetch(url);
  const html = await res.text();
  const files: DriveFile[] = [];
  const entries = html.split('class="flip-entry"');
  for (const entry of entries) {
    const idMatch = entry.match(/id="entry-([a-zA-Z0-9_-]{20,})"/);
    const nameMatch = entry.match(/flip-entry-title">([^<]+)/);
    if (idMatch && nameMatch) {
      const name = decodeURIComponent(nameMatch[1].replace(/\+/g, " "));
      // Extract date from filename: ...Shopee-DD_MM_YYYY-DD_MM_YYYY.csv
      const dateMatch = name.match(/(\d{2})_(\d{2})_(\d{4})-\d{2}_\d{2}_\d{4}/);
      if (dateMatch) {
        const [, dd, mm, yyyy] = dateMatch;
        files.push({ id: idMatch[1], name, date: `${yyyy}-${mm}-${dd}`, shop: shopName });
      }
    }
  }
  return files.sort((a, b) => b.date.localeCompare(a.date));
}

/** Download a raw CSV file from Drive */
async function downloadCsv(fileId: string): Promise<string> {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

/** List all Shopee ads CSV files from Drive */
export async function listShopeeAdsFiles(): Promise<DriveFile[]> {
  const folders = await listShopFolders();
  const allFiles: DriveFile[] = [];
  for (const folder of folders) {
    const files = await listFilesInFolder(folder.id, folder.name);
    allFiles.push(...files);
  }
  return allFiles.sort((a, b) => b.date.localeCompare(a.date));
}

/** Import Shopee ads CSV files from Drive for a date range */
export async function scanAndImportShopeeAds(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const from = opts.from || "2000-01-01";
  const to = opts.to || "9999-12-31";

  const allFiles = await listShopeeAdsFiles();
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const f of allFiles) {
    if (f.date < from || f.date > to) { skipped++; continue; }
    try {
      const csv = await downloadCsv(f.id);
      const result = await uploadShopeeCsv(csv);
      if (result.ok) {
        imported++;
      } else {
        errors.push(`${f.shop}/${f.name}: ${result.error}`);
      }
    } catch (e) {
      errors.push(`${f.shop}/${f.name}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return { imported, skipped, errors };
}
