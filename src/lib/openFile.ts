export function pickPdfFile(onFile: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onFile(file);
    input.remove();
  });
  document.body.append(input);
  input.click();
}
