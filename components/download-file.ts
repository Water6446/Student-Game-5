"use client";

/** Hand the browser a text file to save (a CSV export, a JSON copy). */
export function downloadFile(name: string, text: string, type = "text/csv;charset=utf-8;"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // some browsers read the blob after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
