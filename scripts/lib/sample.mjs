import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "tests",
  "fixtures",
  "pdf",
);

/** Drop a PDF fixture into the app without a static /samples directory. */
export async function dropSample(page, fileName = "sample-cn.pdf") {
  const data = readFileSync(join(FIXTURES, fileName)).toString("base64");
  await page.evaluate(
    ({ name, base64 }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const root = document.querySelector("#root > div");
      if (!root) throw new Error("app root missing");
      root.dispatchEvent(
        new DragEvent("drop", {
          dataTransfer: (() => {
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], name, { type: "application/pdf" }));
            return transfer;
          })(),
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { name: fileName, base64: data },
  );
}
