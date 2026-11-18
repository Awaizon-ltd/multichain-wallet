// Port of crypto-wallet/utils/security/DomainSecurityChecker.js for the
// extension, with two browser-specific fixes:
//  - browsers hand us IDN hostnames as punycode ("xn--…"), so look-alike
//    Unicode domains are caught by that prefix rather than by Cyrillic ranges;
//  - typosquatting is checked against every label, not just the first, so
//    "app.uniswaps.org" is caught as well as "uniswaps.org".

export interface DomainVerdict {
  hostname: string;
  isLegitimate: boolean;
  isHighRisk: boolean;
  score: number;
  riskLevel: "High Risk" | "Medium Risk" | "Low Risk" | "Minimal Risk";
  warnings: string[];
  category?: string;
}

const LEGITIMATE = new Map<string, string>([
  ["uniswap.org", "DEX"],
  ["app.uniswap.org", "DEX"],
  ["pancakeswap.finance", "DEX"],
  ["app.aave.com", "Lending"],
  ["aave.com", "Lending"],
  ["curve.fi", "DEX"],
  ["opensea.io", "NFT"],
  ["blur.io", "NFT"],
  ["magiceden.io", "NFT"],
  ["app.1inch.io", "DEX"],
  ["sushi.com", "DEX"],
  ["app.compound.finance", "Lending"],
  ["compound.finance", "Lending"],
  ["lido.fi", "Staking"],
  ["coingecko.com", "Analytics"],
  ["coinmarketcap.com", "Analytics"],
  ["defillama.com", "Analytics"],
  ["etherscan.io", "Explorer"],
  ["bscscan.com", "Explorer"],
  ["polygonscan.com", "Explorer"],
  ["arbiscan.io", "Explorer"],
  ["optimistic.etherscan.io", "Explorer"],
  ["pinksale.finance", "Launchpad"],
  ["minter.merkly.com", "Gas Refuel"],
  ["merkly.com", "Cross-chain"],
  ["jumper.exchange", "Bridge"],
  ["li.fi", "Bridge"],
  ["arc.etherscan.io", "Explorer"],
  ["robinhoodchain.blockscout.com", "Explorer"],
  ["robinhood.com", "Official"],
  ["jup.ag", "DEX"],
  ["raydium.io", "DEX"],
  ["awarizon.com", "Official"],
]);

const MALICIOUS = [
  /pancake-swap/i,
  /uniswap-app/i,
  /uni-swap/i,
  /opensee/i,
  /metama5k/i,
  /metamusk/i,
  /pink-sale/i,
  /airdrop-claim/i,
  /claim-tokens/i,
  /free-nft/i,
  /eth-giveaway/i,
  /connect-wallet-verify/i,
  /validate-wallet/i,
  /wallet-?connect-?(fix|sync|verify|rectify)/i,
];

const SUSPICIOUS_TLDS = [".xyz", ".tk", ".ml", ".ga", ".cf", ".gq", ".top", ".click", ".link", ".work", ".icu"];
const POPULAR = ["uniswap", "pancakeswap", "opensea", "metamask", "aave", "curve", "sushi", "compound", "pinksale", "blur", "lido", "merkly", "robinhood", "rizon", "awarizon", "jupiter", "raydium"];
const SCAM_KEYWORDS = ["airdrop", "claim", "free", "giveaway", "bonus", "verify", "validate", "confirm", "urgent", "limited"];

function levenshtein(a: string, b: string): number {
  const m = Array.from({ length: b.length + 1 }, (_, i) => [i, ...Array(a.length).fill(0)]);
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1;
  return m[b.length][a.length];
}

const SUBS: Record<string, string> = { "1": "l", "0": "o", "3": "e", "4": "a", "5": "s", "9": "g", "@": "a", $: "s" };
const unsubstitute = (s: string) => s.replace(/[1034594@$]/g, (c) => SUBS[c] ?? c).replace(/rn/g, "m").replace(/vv/g, "w");

function typosquat(hostname: string): string | undefined {
  const labels = hostname.toLowerCase().split(".").slice(0, -1); // drop the TLD
  for (const label of labels) {
    if (POPULAR.includes(label)) continue; // a real brand label ("awarizon") isn't a squat on another ("rizon")
    for (const popular of POPULAR) {
      if (label === popular) continue;
      // Edit distance only for longer brands: for short ones ("curve", "blur",
      // "lido") a one-letter change is usually just an ordinary word ("cure").
      // Short brands are still caught by look-alike characters and additions below.
      if (popular.length > 5) {
        const d = levenshtein(label, popular);
        if (d > 0 && d <= 2) return popular;
      }
      if (unsubstitute(label) === popular) return popular;
      if (label.includes(popular) && label.length < popular.length + 6) return popular;
    }
  }
  return undefined;
}

const riskLevel = (s: number): DomainVerdict["riskLevel"] =>
  s >= 70 ? "High Risk" : s >= 40 ? "Medium Risk" : s >= 20 ? "Low Risk" : "Minimal Risk";

export function checkOrigin(origin: string): DomainVerdict {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return { hostname: origin, isLegitimate: false, isHighRisk: true, score: 100, riskLevel: "High Risk", warnings: ["Unrecognised origin"] };
  }
  const hostname = url.hostname.toLowerCase();
  const bare = hostname.replace(/^www\./, "");
  // Subdomains of a verified domain are controlled by the same owner.
  let category = LEGITIMATE.get(bare);
  if (!category) {
    for (const [d, c] of LEGITIMATE) if (bare.endsWith("." + d)) category = c;
  }
  if (category && url.protocol === "https:") {
    return { hostname, isLegitimate: true, isHighRisk: false, score: 0, riskLevel: "Minimal Risk", warnings: [], category };
  }

  const warnings: string[] = [];
  let score = 0;
  let high = false;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  if (url.protocol !== "https:" && !isLocal) {
    score += 40;
    warnings.push("This site isn't using a secure (HTTPS) connection.");
  }
  if (MALICIOUS.some((p) => p.test(hostname))) {
    high = true;
    score += 100;
    warnings.push("This domain matches known phishing patterns.");
  }
  const similar = typosquat(bare);
  if (similar) {
    high = true;
    score += 80;
    warnings.push(`Possible fake site — this looks like "${similar}" but isn't the official domain.`);
  }
  if (hostname.split(".").some((l) => l.startsWith("xn--"))) {
    high = true;
    score += 70;
    warnings.push("This domain uses look-alike international characters (punycode), a common phishing trick.");
  }
  const tld = "." + hostname.split(".").pop();
  if (SUSPICIOUS_TLDS.includes(tld)) {
    score += 30;
    warnings.push(`Unusual domain extension (${tld}) often used for phishing.`);
  }
  if (hostname.split(".").length - 2 > 2) {
    score += 20;
    warnings.push("Unusually many subdomains.");
  }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && !isLocal) {
    score += 40;
    warnings.push("This site uses a raw IP address instead of a domain name.");
  }
  const main = bare.split(".")[0];
  if (main.length > 20 || /([a-z]{1,2}\d{3,}|\d{3,}[a-z]{1,2})/i.test(main)) {
    score += 15;
    warnings.push("The domain name looks randomly generated.");
  }
  const kw = SCAM_KEYWORDS.find((k) => hostname.includes(k));
  if (kw) {
    score += 25;
    warnings.push(`The domain contains a common scam keyword ("${kw}").`);
  }
  if (score >= 70) high = true;
  return { hostname, isLegitimate: false, isHighRisk: high, score, riskLevel: riskLevel(score), warnings };
}
