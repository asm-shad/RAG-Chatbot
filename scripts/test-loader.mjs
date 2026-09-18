import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";

const loader = new PuppeteerWebBaseLoader(
  "https://example.com",
  {
    launchOptions: {
      headless: true,
    },
  }
);

const docs = await loader.load();

console.log("Documents:", docs.length);
console.log(docs[0].pageContent.slice(0, 500));