import fetch from "node-fetch";
import FormData from "form-data";

async function testRead() {
  const url = "https://drive-ai-file-reader-572028997371.us-east1.run.app/api/read";
  const key1 = "dk_app_398621514c374c1bbaee5c20d65f2a83";

  const buffer = Buffer.from("dummy content", "utf-8");
  const form = new FormData();
  form.append('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": key1,
        ...form.getHeaders()
      },
      body: form
    });
    console.log(`Status: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log(`Response: ${text.substring(0, 500)}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }
}
testRead();
