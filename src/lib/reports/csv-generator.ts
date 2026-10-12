export function generateCSV(data: unknown[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0] as Record<string, unknown>);
  const rows = data.map((row) => {
    const record = row as Record<string, unknown>;
    return headers.map((header) => {
      const value = record[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
