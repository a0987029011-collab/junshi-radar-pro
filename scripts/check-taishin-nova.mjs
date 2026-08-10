import { fetchTaishinNovaQuotes } from "./lib/taishin-nova.mjs";

const registerAuth = process.argv.includes("--register");
const snapshot = await fetchTaishinNovaQuotes({ registerAuth });
const twse = snapshot.quotes.filter(
  (quote) => quote.exchange === "TWSE"
).length;
const tpex = snapshot.quotes.filter(
  (quote) => quote.exchange === "TPEx"
).length;

console.log(
  `Taishin Nova ${snapshot.date}: TWSE ${twse}, TPEx ${tpex}, total ${snapshot.quotes.length}`
);
