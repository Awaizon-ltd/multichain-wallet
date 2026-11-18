// Poster generator — seeded 3D marketing posters (1024 x 1024 PNG).
// Layers, back to front: background scene → hero elements → phone → copy (2D) → finishing.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ============================================================================
   BRAND — change this one constant ("RIZON" or "ZELA").
   (The UI and batch.js can also pass ?brand=ZELA in the URL.)
============================================================================ */
const BRAND = "RIZON";

const SIZE = 1024;
const SAFE = 72; // safe-area margin in px: nothing important goes outside it

/* ============================================================================
   Brands. palette = [base, base2, primary, secondary, accent]
============================================================================ */
const cap = (goal, headline, support, cta, hero, phone = null) => ({ goal, headline, support, cta, hero, phone });

const BRANDS = {
  RIZON: {
    key: "RIZON",
    name: "Rizon",
    logoText: "Rizon",
    tagline: "Your keys. Every chain.",
    domain: "rizon.awarizon.com",
    dark: true,
    palette: ["#0a0a0a", "#161616", "#d6fa1b", "#00c2a8", "#e7fc70"],
    ink: "#f5f5f5",
    inkSoft: "#c2c2c2",
    ctaBg: "#d6fa1b",
    ctaInk: "#0a0a0a",
    materials: { primary: "#d6fa1b", dark: "#151515", chrome: "#d4d7dc", soft: "#f2f2f2" },
    bloom: { strength: 0.34, radius: 0.45, threshold: 0.74 },
    grade: { tint: "#f6ffe0", tintAmt: 0.05, sat: 1.06, vignette: 0.55, vigColor: "#000000", grain: 0.05 },
    coinFaces: ["usd", "mark", "eth", "sol", "base", "usd", "mark"],
    heroes: ["coin", "shield", "wallet", "bolt", "check", "chain", "nodes", "trophy", "gift"],
    defaultPhone: "app-wallet",
    ctaDefault: "Get Rizon",
    // Campaign values used by prize-pool / referral / giveaway captions. Set real values before publishing.
    campaign: { prize: "$10,000", bonus: "$5", giveaway: "$1,000 in USDC", ends: "Dec 31" },
    kickers: {
      awareness: ["Self-custody wallet", "EVM + Solana", "Now on Android"],
      conversion: ["Free download", "Live now", "Get started"],
      trust: ["Your keys", "Scam protection", "Self-custody"],
      convenience: ["One wallet", "Every chain", "One tap"],
      "prize-pool": ["Prize pool", "Leaderboard live", "Limited time"],
      referral: ["Referral program", "Invite & earn", "Rewards"],
      giveaway: ["Giveaway", "Limited time", "Win"],
      launch: ["New", "Just launched", "Now live"],
    },
    captions: [
      // awareness
      cap("awareness", "Your keys. *Every chain.*", "One self-custody wallet for Ethereum, Base, Solana and more.", "Get Rizon", "nodes", "app-wallet"),
      cap("awareness", "One phrase. *Nine networks.*", "Ethereum, Base, Arc, Robinhood Chain, Solana and more from one recovery phrase.", "Get Rizon", "chain"),
      cap("awareness", "EVM and Solana. *One wallet.*", "Hold ETH and SOL side by side. No second app needed.", "Get Rizon", "coin"),
      cap("awareness", "Meet *Rizon.*", "The self-custody wallet for your phone and your browser.", "PLAY", "wallet", "app-wallet"),
      cap("awareness", "Now on *desktop.*", "The Rizon Chrome extension. Same wallet, same accounts as your phone.", "Add to Chrome", "wallet"),
      cap("awareness", "Send to *@names*, not 0x…", "Claim an @username and get paid by name on EVM and Solana.", "Claim your @name", "check", "send"),
      cap("awareness", "Crypto that *just works.*", "Balances, swaps and bridges in one clean app.", "Get Rizon", "bolt", "app-wallet"),
      cap("awareness", "Your portfolio, *live.*", "Every token on every network, priced in real time.", "Get Rizon", "coin", "app-market"),
      cap("awareness", "Built for *Base.*", "Fast, low-fee transactions on Base, plus every other network you use.", "Get Rizon", "coin"),
      cap("awareness", "Web3, *without the mess.*", "One wallet for every dApp. No tab juggling.", "Try Rizon", "nodes", "app-dapp"),
      // conversion
      cap("conversion", "Swap in *one tap.*", "Best price across DEXs, with the minimum you'll receive shown up front.", "Swap on Rizon", "bolt", "app-swap"),
      cap("conversion", "Bridge to Solana in *one step.*", "EVM to Solana in a single transaction.", "Get Rizon", "chain", "app-swap"),
      cap("conversion", "Download Rizon. *It's free.*", "Set up a wallet in under a minute.", "PLAY", "wallet", "app-wallet"),
      cap("conversion", "Get it on *Google Play.*", "Rizon for Android is live. Your keys go with you.", "PLAY", "coin", "app-wallet"),
      cap("conversion", "Add Rizon to *Chrome.*", "Connect to any dApp with a wallet that has your back.", "Add to Chrome", "shield"),
      cap("conversion", "Claim your *@username.*", "Short, simple and linked to your EVM and Solana addresses.", "Claim your @name", "check", "send"),
      cap("conversion", "Your first swap is *seconds away.*", "Pick a token, see the price, confirm. Done.", "Swap on Rizon", "coin", "app-swap"),
      cap("conversion", "Import your wallet in *60 seconds.*", "Bring your recovery phrase and pick up where you left off.", "Get Rizon", "wallet", "app-wallet"),
      cap("conversion", "Track the market. *Trade the move.*", "Trending tokens, gainers and live charts in your pocket.", "PLAY", "bolt", "app-market"),
      cap("conversion", "Get paid *by QR.*", "Share your code, receive on EVM or Solana in seconds.", "Get Rizon", "coin", "app-receive"),
      // trust
      cap("trust", "Your wallet. *Your keys.*", "Keys are created and encrypted on your device. Nobody else can move your funds.", "Get Rizon", "shield"),
      cap("trust", "Scams flagged *before you click.*", "Look-alike sites and risky approvals, called out in plain English.", "Add to Chrome", "shield"),
      cap("trust", "No unlimited approvals. *Ever.*", "Rizon approves the exact amount you swap. Nothing more.", "Get Rizon", "check"),
      cap("trust", "See it *before you sign.*", "Every transaction is simulated first, so you know what happens.", "Get Rizon", "check", "success"),
      cap("trust", "Encrypted backup. *Your Drive.*", "An encrypted copy of your phrase in your own Google Drive. Only if you want it.", "Get Rizon", "shield"),
      cap("trust", "Scam NFTs? *Hidden.*", "Spam airdrops are filtered out automatically.", "Get Rizon", "shield"),
      cap("trust", "Not your keys? *Not here.*", "Rizon is self-custody. Your phrase never leaves your device.", "PLAY", "wallet"),
      cap("trust", "Connect on *your terms.*", "Websites only see the account you choose to share.", "Get Rizon", "check", "app-dapp"),
      cap("trust", "Verified sites, *clearly marked.*", "Know who you're connecting to before you approve.", "Add to Chrome", "check"),
      cap("trust", "Self-custody, *made simple.*", "AES-256 encryption on your device. No account, no sign-up.", "Get Rizon", "shield", "app-wallet"),
      // convenience
      cap("convenience", "Every chain. *One balance.*", "Your whole portfolio in one number.", "Get Rizon", "coin", "app-wallet"),
      cap("convenience", "Swap without the *guesswork.*", "Route, price impact and minimum received on one screen.", "Swap on Rizon", "bolt", "app-swap"),
      cap("convenience", "Phone to browser. *Same wallet.*", "Import once. Use Rizon on Android and Chrome.", "Get Rizon", "chain", "app-wallet"),
      cap("convenience", "Scan. Send. *Done.*", "QR codes for receiving, @usernames for sending.", "Get Rizon", "check", "app-receive"),
      cap("convenience", "Payment *sent.*", "Fast confirmations on Base and Solana.", "Get Rizon", "check", "success"),
      cap("convenience", "Bridge without *the tabs.*", "Cross-chain in one transaction, from one app.", "Get Rizon", "chain"),
      cap("convenience", "Auto-lock. *Peace of mind.*", "Rizon locks itself when you step away.", "Get Rizon", "shield"),
      cap("convenience", "All your tokens. *One tap away.*", "Ethereum, Base, Solana and more, side by side.", "PLAY", "coin", "app-wallet"),
      cap("convenience", "Connect to any *dApp.*", "Ethereum and Solana apps, approved by you every time.", "Get Rizon", "nodes", "app-dapp"),
      cap("convenience", "Less clicking. *More crypto.*", "Swaps, sends and bridges built to be fast.", "Get Rizon", "bolt", "send"),
      // campaigns — {prize} {bonus} {giveaway} {ends} come from campaign above
      cap("prize-pool", "Win a share of *{prize}.*", "Swap on Rizon to enter. Ends {ends}.", "Join now", "trophy", "app-swap"),
      cap("prize-pool", "*{prize}* prize pool is live.", "Every swap on Rizon is an entry. Ends {ends}.", "Join now", "trophy"),
      cap("prize-pool", "Swap. Climb. *Win.*", "Top traders share {prize}. Ends {ends}.", "Start swapping", "trophy", "app-market"),
      cap("prize-pool", "The more you swap, *the more you win.*", "{prize} prize pool for Rizon traders.", "Swap on Rizon", "coin", "app-swap"),
      cap("prize-pool", "*{prize}* up for grabs.", "Swap on any chain in Rizon to enter.", "PLAY", "trophy"),
      cap("prize-pool", "Your swaps could win *{prize}.*", "Leaderboard closes {ends}.", "Join now", "trophy", "app-swap"),
      cap("referral", "Invite friends. *Earn {bonus}.*", "For every friend who joins Rizon and makes a swap.", "Invite friends", "gift", "send"),
      cap("referral", "Share Rizon. *Get {bonus}.*", "Your friend gets {bonus} too.", "Invite friends", "gift"),
      cap("referral", "Bring a friend. *You both earn.*", "{bonus} each when they make their first swap.", "Get your link", "gift"),
      cap("referral", "Your link. *Your rewards.*", "Earn {bonus} for every friend who joins.", "Get your link", "chain", "qr"),
      cap("referral", "No limit on *referral rewards.*", "{bonus} for every friend who joins and swaps.", "Invite friends", "gift"),
      cap("referral", "Friends earn too. *Everyone wins.*", "You and your friend each get {bonus}.", "Invite friends", "gift", "send"),
      cap("giveaway", "Giveaway *time.*", "Follow, share and win {giveaway}.", "Enter now", "gift"),
      cap("giveaway", "We're giving away *{giveaway}.*", "Download Rizon to enter. Ends {ends}.", "PLAY", "gift"),
      cap("giveaway", "Win *{giveaway}* in our launch giveaway.", "Create a Rizon wallet to enter.", "Enter now", "gift", "app-wallet"),
      cap("giveaway", "Claim your @username, *win {giveaway}.*", "Every new @username is an entry.", "Claim your @name", "check", "send"),
      cap("giveaway", "Enter to win *{giveaway}.*", "Winners announced {ends}.", "Enter now", "trophy"),
      cap("giveaway", "Your wallet could win *{giveaway}.*", "Make any swap in Rizon before {ends}.", "Swap on Rizon", "coin", "app-swap"),
      cap("launch", "Now live: *Rizon for Chrome.*", "Same wallet, same accounts, on desktop.", "Add to Chrome", "wallet"),
      cap("launch", "New: *bridge to Solana.*", "EVM to Solana in a single transaction.", "Get Rizon", "chain", "app-swap"),
      cap("launch", "Now on *Robinhood Chain.*", "Hold and swap on Robinhood Chain in Rizon.", "Get Rizon", "coin"),
      cap("launch", "New: *@usernames.*", "Send crypto by name on EVM and Solana.", "Claim your @name", "check", "send"),
      cap("launch", "Arc is live *in Rizon.*", "Hold and send USDC on Arc.", "Get Rizon", "coin"),
      cap("launch", "Explore web3 *inside Rizon.*", "A built-in dApp browser with bridges, DeFi and trending tokens.", "Get Rizon", "nodes", "app-dapp"),
      cap("launch", "Rizon is *on Google Play.*", "The self-custody wallet for Android.", "PLAY", "wallet", "app-wallet"),
    ],
  },

  ZELA: {
    key: "ZELA",
    name: "Zela Pay",
    logoText: "Zela Pay",
    tagline: "Get paid in stablecoins. Instantly.",
    domain: "zelapay.xyz",
    dark: false,
    palette: ["#f6f8fd", "#dbe5fb", "#2563ff", "#0b1b3f", "#38bdf8"],
    ink: "#0b1b3f",
    inkSoft: "#46557a",
    ctaBg: "#2563ff",
    ctaInk: "#ffffff",
    materials: { primary: "#2563ff", dark: "#0b1b3f", chrome: "#e3e8f2", soft: "#ffffff" },
    bloom: { strength: 0.15, radius: 0.4, threshold: 0.97 },
    grade: { tint: "#eef4ff", tintAmt: 0.04, sat: 1.03, vignette: 0.16, vigColor: "#c3d2f2", grain: 0.03 },
    coinFaces: ["usd", "z", "usd", "usdBlue"],
    heroes: ["coin", "shield", "wallet", "card", "bolt", "check", "chain", "nodes", "trophy", "gift"],
    defaultPhone: "checkout",
    ctaDefault: "Get started",
    // Campaign values used by prize-pool / referral / giveaway captions. Set real values before publishing.
    campaign: { prize: "$10,000", bonus: "$25", giveaway: "$1,000 in USDC", ends: "Dec 31" },
    kickers: {
      awareness: ["Crypto payments", "For merchants", "Stablecoin checkout"],
      conversion: ["Start today", "Live in minutes", "Get started"],
      trust: ["Settled on-chain", "Non-custodial", "Final payments"],
      convenience: ["One dashboard", "One tap", "Any wallet"],
      "prize-pool": ["Prize pool", "Leaderboard live", "Limited time"],
      referral: ["Referral program", "Invite & earn", "Rewards"],
      giveaway: ["Giveaway", "Limited time", "Win"],
      launch: ["New", "Just launched", "Now live"],
    },
    captions: [
      // awareness
      cap("awareness", "Get paid in *USDC.* Instantly.", "Accept stablecoin payments with Zela Pay checkout.", "Get started", "coin", "checkout"),
      cap("awareness", "Checkout in *one tap.*", "Customers pay from any wallet in seconds.", "Try Zela Pay", "bolt", "checkout"),
      cap("awareness", "Crypto payments for *every store.*", "Add Zela Pay checkout to your site in minutes.", "Get started", "card"),
      cap("awareness", "The checkout *built for web3.*", "Stablecoin payments your customers already know how to make.", "Try Zela Pay", "card", "checkout"),
      cap("awareness", "Global payments. *Zero borders.*", "Accept customers from anywhere, settled in stablecoins.", "Get started", "nodes"),
      cap("awareness", "Meet *Zela Pay.*", "The payment gateway for merchants who want to get paid faster.", "Try Zela Pay", "card", "success"),
      cap("awareness", "Stablecoins, *made for business.*", "Price in dollars. Get paid in USDC.", "Get started", "coin"),
      cap("awareness", "Your store, *on-chain.*", "Payment links, invoices and checkout in one dashboard.", "Get started", "chain", "balance"),
      cap("awareness", "Money at *internet speed.*", "Payments land in seconds, not days.", "Try Zela Pay", "bolt"),
      cap("awareness", "Payments that *never sleep.*", "Accept payments 24/7, weekends and holidays included.", "Get started", "coin"),
      // conversion
      cap("conversion", "Start accepting crypto *today.*", "Create a merchant account in minutes.", "Start accepting", "card", "checkout"),
      cap("conversion", "Launch checkout in *5 minutes.*", "Drop-in checkout. No blockchain code required.", "Get started", "bolt"),
      cap("conversion", "Keep more of *every sale.*", "Stablecoin payments without the card-network markup.", "Get started", "coin"),
      cap("conversion", "Create a payment link in *seconds.*", "Share it anywhere and get paid in USDC.", "Create a link", "chain", "qr"),
      cap("conversion", "Turn wallets into *customers.*", "Millions hold stablecoins. Let them pay you.", "Start accepting", "wallet"),
      cap("conversion", "Accept USDC. *Grow faster.*", "Reach crypto-native buyers from day one.", "Get started", "coin", "success"),
      cap("conversion", "Invoice in USDC. *Paid in minutes.*", "Send an invoice, get a stablecoin payment back.", "Try Zela Pay", "check", "balance"),
      cap("conversion", "One integration. *Every wallet.*", "One checkout that works with the wallets your customers use.", "Get started", "nodes", "checkout"),
      cap("conversion", "Sell globally *from day one.*", "No foreign card fees, no currency headaches.", "Start accepting", "nodes"),
      cap("conversion", "Paid *before the coffee cools.*", "Settlement in seconds, straight to your wallet.", "Try Zela Pay", "bolt", "success"),
      // trust
      cap("trust", "No chargebacks. *No waiting.*", "On-chain payments are final. Settlement is instant.", "Get started", "shield"),
      cap("trust", "Settled on-chain. *Verified instantly.*", "Every payment is confirmed on the blockchain.", "Try Zela Pay", "check", "success"),
      cap("trust", "Funds go *straight to you.*", "Non-custodial settlement to your own wallet.", "Get started", "wallet"),
      cap("trust", "Every payment, *on the record.*", "Transparent, auditable transactions.", "Try Zela Pay", "chain"),
      cap("trust", "Secure checkout, *by default.*", "Customers approve every payment in their own wallet.", "Get started", "shield", "checkout"),
      cap("trust", "Fraud-resistant *by design.*", "No card numbers to steal. No chargebacks to fight.", "Get started", "shield"),
      cap("trust", "Payment *successful.*", "Clear confirmations for you and your customer.", "Try Zela Pay", "check", "success"),
      cap("trust", "Transparent fees. *No surprises.*", "See exactly what every payment costs.", "Get started", "check"),
      cap("trust", "Your money. *Your wallet.*", "Zela Pay never holds your funds.", "Get started", "wallet"),
      cap("trust", "Every receipt, *on-chain.*", "Proof of payment that can't be edited or lost.", "Try Zela Pay", "check", "balance"),
      // convenience
      cap("convenience", "Scan. Pay. *Done.*", "QR checkout for in-store and online.", "Try Zela Pay", "check", "qr"),
      cap("convenience", "Payment links *in seconds.*", "No website needed. Share a link, get paid.", "Create a link", "chain", "qr"),
      cap("convenience", "Real-time *payment alerts.*", "Know the moment a customer pays.", "Get started", "bolt", "success"),
      cap("convenience", "One dashboard for *every payment.*", "Checkout, links and invoices in one place.", "Try Zela Pay", "card", "balance"),
      cap("convenience", "A simple API for *any stack.*", "Add checkout with a few lines of code.", "Get started", "nodes"),
      cap("convenience", "Get paid *while you sleep.*", "Your checkout works around the clock.", "Get started", "coin"),
      cap("convenience", "Withdraw *anytime.*", "Your balance, ready when you are.", "Try Zela Pay", "wallet", "balance"),
      cap("convenience", "Checkout that *works on mobile.*", "Customers tap, approve and they're done.", "Get started", "card", "checkout"),
      cap("convenience", "Accept payments *from any wallet.*", "Customers pay with the wallet they already use.", "Start accepting", "wallet"),
      cap("convenience", "Cross-border, *zero hassle.*", "One price, paid in USDC, anywhere in the world.", "Get started", "nodes"),
      // campaigns — {prize} {bonus} {giveaway} {ends} come from campaign above
      cap("prize-pool", "Accept USDC, *win {prize}.*", "Every payment through Zela Pay is an entry. Ends {ends}.", "Join the challenge", "trophy", "checkout"),
      cap("prize-pool", "*{prize}* for top merchants.", "The merchants with the most Zela Pay sales share the pool.", "Join the challenge", "trophy", "balance"),
      cap("prize-pool", "Process more. *Win more.*", "{prize} prize pool for Zela Pay merchants. Ends {ends}.", "Get started", "trophy"),
      cap("prize-pool", "Merchant challenge: *{prize} pool.*", "Accept stablecoin payments to climb the leaderboard.", "Join the challenge", "trophy", "balance"),
      cap("prize-pool", "Your next sale could *win {prize}.*", "Every checkout counts. Ends {ends}.", "Get started", "coin", "checkout"),
      cap("prize-pool", "Top sellers share *{prize}.*", "Leaderboard updates in real time.", "Join the challenge", "trophy"),
      cap("referral", "Refer a merchant. *Earn {bonus}.*", "For every business that joins Zela Pay and takes a payment.", "Get your link", "gift"),
      cap("referral", "Know a store? *Get {bonus}.*", "Share Zela Pay with a business owner you know.", "Get your link", "gift"),
      cap("referral", "Grow the network. *Get paid.*", "{bonus} for every merchant you refer.", "Get your link", "nodes"),
      cap("referral", "Your referral link pays *{bonus}.*", "Share it anywhere. No limit on referrals.", "Get your link", "chain", "qr"),
      cap("referral", "Two merchants. *Two rewards.*", "You and your referral each get {bonus}.", "Get your link", "gift"),
      cap("referral", "Referral rewards, *settled instantly.*", "Paid in USDC, straight to your wallet.", "Get your link", "coin", "success"),
      cap("giveaway", "Win *{giveaway}.*", "New merchants are entered automatically. Ends {ends}.", "Enter now", "gift"),
      cap("giveaway", "Launch giveaway: *{giveaway}.*", "Sign up for Zela Pay to enter.", "Enter now", "gift"),
      cap("giveaway", "Sign up. *Get entered.*", "Every new merchant account is a chance to win {giveaway}.", "Get started", "check"),
      cap("giveaway", "Your first payment could *win {giveaway}.*", "Accept a payment with Zela Pay before {ends}.", "Get started", "coin", "success"),
      cap("giveaway", "We're giving away *{giveaway}.*", "Create a merchant account to enter.", "Enter now", "gift"),
      cap("giveaway", "Giveaway *time.*", "Follow, share and win {giveaway}.", "Enter now", "trophy"),
      cap("launch", "New: *payment links.*", "Share a link, get paid in USDC.", "Create a link", "chain", "qr"),
      cap("launch", "Now live: *USDC invoices.*", "Send an invoice, get paid on-chain.", "Try Zela Pay", "check", "balance"),
      cap("launch", "New: *Solana payments.*", "Accept USDC on Solana and Base.", "Get started", "nodes"),
      cap("launch", "Checkout, *now faster.*", "Fewer steps from cart to paid.", "Try Zela Pay", "bolt", "checkout"),
      cap("launch", "Just launched: *Zela Pay.*", "Stablecoin checkout for every business.", "Get started", "card", "checkout"),
      cap("launch", "New dashboard, *clearer numbers.*", "Every payment and payout in one view.", "Try Zela Pay", "card", "balance"),
    ],
  },
};

// Elements that sit naturally next to each hero.
const RELATED = {
  coin: ["coin", "coin", "check", "bolt"],
  shield: ["check", "coin", "coin", "nodes"],
  wallet: ["coin", "coin", "shield", "card"],
  card: ["coin", "coin", "check", "bolt"],
  bolt: ["coin", "coin", "check"],
  check: ["coin", "coin", "shield", "bolt"],
  chain: ["nodes", "coin", "coin"],
  nodes: ["chain", "coin", "coin"],
  trophy: ["coin", "coin", "check", "gift"],
  gift: ["coin", "coin", "trophy", "check"],
};

/* ============================================================================
   Layouts — all in poster pixels (1024 x 1024). Each one says where the hero
   goes (a circle), where the copy goes (a box the hero never enters), and
   where supporting elements can float.
============================================================================ */
const LAYOUTS = {
  "hero-center": {
    logo: { x: 512, y: 104, align: "center" },
    text: { x: SAFE, y: 150, w: 1024 - 2 * SAFE, h: 206, align: "center", valign: "top", max: 112 },
    hero: { x: 512, y: 594, r: 196 },
    phone: { x: 512, y: 604, h: 244 }, // phone half-height in px
    cta: { x: 512, y: 852, align: "center" },
    supports: [[175, 520, 62], [850, 470, 70], [230, 770, 52], [800, 760, 58], [118, 660, 34], [906, 640, 38]],
  },
  diagonal: {
    logo: { x: SAFE, y: 104, align: "left" },
    text: { x: SAFE, y: 150, w: 560, h: 330, align: "left", valign: "top", max: 108 },
    hero: { x: 704, y: 640, r: 222 },
    phone: { x: 780, y: 636, h: 300 },
    cta: { x: SAFE, y: 846, align: "left" },
    supports: [[860, 232, 70], [700, 150, 38], [132, 600, 46], [370, 712, 36], [930, 450, 34]],
  },
  split: {
    logo: { x: SAFE, y: 104, align: "left" },
    text: { x: SAFE, y: 240, w: 460, h: 420, align: "left", valign: "center", max: 96 },
    hero: { x: 760, y: 520, r: 194 },
    phone: { x: 770, y: 520, h: 340 },
    cta: { flow: true, align: "left" },
    supports: [[620, 168, 52], [900, 176, 40], [620, 878, 46], [900, 876, 50]],
  },
  "badge-burst": {
    logo: { x: 512, y: 104, align: "center" },
    text: { x: SAFE, y: 628, w: 1024 - 2 * SAFE, h: 196, align: "center", valign: "top", max: 92 },
    hero: { x: 512, y: 400, r: 186 },
    phone: { x: 512, y: 396, h: 232 },
    cta: { x: 512, y: 846, align: "center" },
    burst: true,
    supports: [[170, 300, 56], [860, 320, 62], [196, 560, 40], [830, 580, 44]],
  },
  orbit: {
    logo: { x: SAFE, y: 104, align: "left" },
    text: { x: SAFE, y: 150, w: 640, h: 236, align: "left", valign: "top", max: 104 },
    hero: { x: 572, y: 624, r: 150 },
    phone: { x: 600, y: 628, h: 230 },
    cta: { x: SAFE, y: 846, align: "left" },
    orbit: true,
    supports: [[880, 230, 54], [930, 420, 30]],
  },
  "stacked-depth": {
    logo: { x: SAFE, y: 104, align: "left" },
    text: { x: SAFE, y: 150, w: 500, h: 420, align: "left", valign: "top", max: 104 },
    hero: { x: 730, y: 660, r: 176 },
    phone: { x: 740, y: 610, h: 300 },
    cta: { flow: true, align: "left" },
    stack: [[848, 352, 104, 27], [650, 214, 66, 33]],
    supports: [[150, 800, 40], [440, 880, 30]],
  },
  spotlight: {
    logo: { x: SAFE, y: 104, align: "left" },
    text: { x: SAFE, y: 630, w: 1024 - 2 * SAFE, h: 194, align: "center", valign: "top", max: 96 },
    hero: { x: 512, y: 396, r: 180 },
    phone: { x: 512, y: 396, h: 232 },
    cta: { x: 512, y: 846, align: "center" },
    spotlight: true,
    supports: [[178, 380, 42], [850, 420, 46]],
  },
  "corner-anchor": {
    logo: { x: SAFE, y: 104, align: "left" },
    text: { x: 420, y: 150, w: 1024 - 420 - SAFE, h: 320, align: "right", valign: "top", max: 100 },
    hero: { x: 330, y: 690, r: 248 },
    phone: { x: 262, y: 620, h: 330 },
    cta: { flow: true, align: "right" },
    supports: [[862, 770, 70], [690, 880, 44], [140, 252, 44]],
  },
};

/* ============================================================================
   Seeded RNG (FNV-1a hash → mulberry32). Same string → same poster.
============================================================================ */
function hashString(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seedStr) {
  let a = hashString(seedStr);
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  return r;
}

/* ============================================================================
   Assets (loaded once, before the first render)
============================================================================ */
const ASSET_FILES = {
  mark: "assets/rizon-mark.png",
  play: "assets/google-play-badge.png",
  eth: "assets/chains/ethereum.png",
  sol: "assets/chains/solana.png",
  base: "assets/chains/base.png",
  polygon: "assets/chains/polygon.png",
  arbitrum: "assets/chains/arbitrum.png",
  bnb: "assets/chains/bnb.png",
  avalanche: "assets/chains/avalanche.png",
  "app-wallet": "assets/screens/wallet.webp",
  "app-trade": "assets/screens/trade.webp",
  "app-swap": "assets/screens/swap.webp",
  robinhood: "assets/chains/robinhood-feather.png", // feather cut out of its lime square
  arc: "assets/chains/arc.webp",
  "mk-trending": "assets/screens/markettrending.png",
  "mk-gaining": "assets/screens/marketgaining.png",
  "mk-stocks": "assets/screens/marketstocks.png",
  "mk-rwa": "assets/screens/MarketRWA.png",
  "rcv-main": "assets/screens/receivemain.png",
  "rcv-group": "assets/screens/receivegroup.png",
  dapp: "assets/screens/dappbrowser.png",
};
const IMG = {};
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
const FONT_FACES = ["900 100px Inter", "800 100px Inter", "700 30px Inter", "600 30px Inter", "500 30px Inter", "500 20px 'JetBrains Mono'", "700 20px 'JetBrains Mono'"];
const ready = (async () => {
  await Promise.all(Object.entries(ASSET_FILES).map(async ([k, src]) => (IMG[k] = await loadImage(src))));
  await Promise.all(FONT_FACES.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
})();

/* ============================================================================
   Renderer + post-processing (created once)
============================================================================ */
const glCanvas = document.getElementById("gl") || Object.assign(document.createElement("canvas"), { width: SIZE, height: SIZE });
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
envTex.userData.keep = true;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSeed: { value: 0 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.05 },
    uSat: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uVigColor: { value: new THREE.Color(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSeed, uVignette, uGrain, uSat, uTintAmt;
    uniform vec3 uTint, uVigColor;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423) + uSeed); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = mix(c.rgb, c.rgb * uTint, uTintAmt);
      float v = smoothstep(0.95, 0.3, length(vUv - 0.5) * 1.3);
      c.rgb = mix(uVigColor, c.rgb, mix(1.0 - uVignette, 1.0, v));
      c.rgb += (hash(floor(vUv * 1024.0)) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
    }`,
};

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(1);
composer.setSize(SIZE, SIZE);
const renderPass = new RenderPass(scene, camera);
const bokehPass = new BokehPass(scene, camera, { focus: 20, aperture: 0.0005, maxblur: 0.005 });
const bloomPass = new UnrealBloomPass(new THREE.Vector2(SIZE, SIZE), 0.8, 0.5, 0.2);
const gradePass = new ShaderPass(GradeShader);
composer.addPass(renderPass);
composer.addPass(bokehPass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.addPass(gradePass);

// Depth of field reads a depth pass of the scene. Glows, particles and other
// see-through layers must not write into it, so hide them just for that pass.
const bokehRender = bokehPass.render.bind(bokehPass);
bokehPass.render = (...args) => {
  const hidden = [];
  scene.traverse((o) => {
    if (o.visible && (o.isSprite || o.isPoints || o.isLine || o.material?.transparent)) {
      o.visible = false;
      hidden.push(o);
    }
  });
  bokehRender(...args);
  hidden.forEach((o) => (o.visible = true));
};

/* ============================================================================
   Helpers
============================================================================ */
let B = BRANDS[BRAND]; // current brand
const col = (hex) => new THREE.Color(hex);
const glowBlend = () => (B.dark ? THREE.AdditiveBlending : THREE.NormalBlending);
const rgba = (hex, a) => {
  const c = parseInt(hex.slice(1), 16);
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
};

function canvasTexture(w, h, draw, { keep = false, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.keep = keep;
  return t;
}

// Shared soft textures.
const glowTex = canvasTexture(256, 256, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.22, "rgba(255,255,255,0.45)");
  gr.addColorStop(0.55, "rgba(255,255,255,0.1)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, w);
}, { keep: true, srgb: false });
const dotTex = canvasTexture(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.8)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, w);
}, { keep: true, srgb: false });
const beamTex = canvasTexture(128, 512, (g, w, h) => {
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, "rgba(255,255,255,0.9)");
  v.addColorStop(0.5, "rgba(255,255,255,0.25)");
  v.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  const hz = g.createLinearGradient(0, 0, w, 0);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(0.5, "rgba(0,0,0,1)");
  hz.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = hz;
  g.fillRect(0, 0, w, h);
}, { keep: true, srgb: false });

function clearScene() {
  const disposeTex = (t) => t && t.isTexture && !t.userData.keep && t.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) disposeTex(m[k]);
      if (m.uniforms) Object.values(m.uniforms).forEach((u) => disposeTex(u.value));
      m.dispose();
    }
    if (o.isInstancedMesh) o.dispose();
  });
  scene.clear();
  disposeTex(scene.background);
  scene.background = null;
  scene.fog = null;
}

function glossy(hex, { metal = 0.85, rough = 0.25, clear = 1, emissive = null, ei = 0.1, env = 1.1 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: col(hex),
    metalness: metal,
    roughness: rough,
    clearcoat: clear,
    clearcoatRoughness: 0.12,
    emissive: col(emissive || "#000000"),
    emissiveIntensity: emissive ? ei : 0,
    envMapIntensity: env,
  });
}
function materialSet() {
  const m = B.materials;
  return {
    primary: glossy(m.primary, { metal: B.dark ? 0.7 : 0.55, rough: 0.22, emissive: B.dark ? m.primary : null, ei: 0.015 }),
    dark: glossy(m.dark, { metal: 0.65, rough: 0.28 }),
    chrome: glossy(m.chrome, { metal: 1, rough: 0.14 }),
    soft: glossy(m.soft, { metal: 0.1, rough: 0.32 }),
  };
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
// ShapeGeometry with UVs mapped 0..1 across the given size (for textured screens/faces).
function shapePlane(shape, w, h) {
  const g = new THREE.ShapeGeometry(shape, 24);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}
const extrude = (shape, depth, bevel = 0.08, segs = 5) =>
  new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: segs, curveSegments: 40 }).center();

function polygon(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
const CHECK_PTS = [[-0.62, 0.06], [-0.46, 0.22], [-0.18, -0.06], [0.48, 0.6], [0.64, 0.44], [-0.18, -0.38]];
const BOLT_PTS = [[0.18, 1.25], [-0.66, -0.08], [-0.06, -0.08], [-0.26, -1.25], [0.66, 0.14], [0.06, 0.14]];

// Wrap a model so its bounding sphere is centred on the origin; remember the radius.
function finalize(model, radius = null) {
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  model.position.sub(sphere.center);
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.userData.radius = radius ?? sphere.radius;
  return wrap;
}

/* ============================================================================
   Layer 2 — hero elements, built from geometry
============================================================================ */
function coinFaceTexture(kind) {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    const styles = {
      usd: { a: B.dark ? "#eefc8a" : "#4f86ff", b: B.dark ? "#a8c700" : "#1d4ed8", ink: B.dark ? "#0a0a0a" : "#ffffff", glyph: "$" },
      usdBlue: { a: "#ffffff", b: "#dfe7f7", ink: "#2563ff", glyph: "$" },
      z: { a: "#ffffff", b: "#e1e8f6", ink: "#2563ff", glyph: "Z" },
      mark: { a: "#2a2a2a", b: "#050505", img: "mark", s: 0.62 },
      eth: { a: "#2a2a2a", b: "#060606", img: "eth", s: 0.52 },
      sol: { a: "#2a2a2a", b: "#060606", img: "sol", s: 0.5 },
      base: { a: "#2a2a2a", b: "#060606", img: "base", s: 0.5 },
      robinhood: { a: "#2a2a2a", b: "#060606", img: "robinhood", s: 0.8 },
      arc: { a: "#2a2a2a", b: "#060606", img: "arc", s: 0.56, round: true },
    };
    const st = styles[kind] || styles.usd;
    const gr = g.createRadialGradient(c * 0.7, c * 0.6, 10, c, c, c);
    gr.addColorStop(0, st.a);
    gr.addColorStop(1, st.b);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
    g.strokeStyle = st.ink ? rgba(st.ink === "#ffffff" ? "#ffffff" : "#000000", 0.25) : "rgba(255,255,255,0.18)";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(c, c, c * 0.8, 0, Math.PI * 2);
    g.stroke();
    if (st.img) {
      const s = w * st.s;
      g.save();
      if (st.round) {
        g.beginPath();
        g.arc(c, c, s / 2, 0, Math.PI * 2);
        g.clip();
      }
      g.drawImage(IMG[st.img], c - s / 2, c - s / 2, s, s);
      g.restore();
    } else {
      g.fillStyle = st.ink;
      g.font = `900 ${w * 0.5}px Inter`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(st.glyph, c, c + w * 0.03);
    }
  });
}

// Coin faces for the poster being rendered (set per caption, see coinFacesFor).
let activeCoinFaces = null;

// Chains a caption talks about → only those logos appear on its coins, so a
// Robinhood Chain poster never shows a Solana coin and vice versa.
const CHAIN_MENTIONS = [
  ["robinhood", /robinhood/i],
  ["sol", /solana|\bSOL\b/],
  ["base", /\bBase\b/],
  ["arc", /\bArc\b/],
  ["eth", /ethereum|\bETH\b|\bEVM\b/i],
];
function coinFacesFor(caption) {
  if (B.key !== "RIZON") return B.coinFaces; // Zela keeps its own faces
  const text = `${caption.headline} ${caption.support}`;
  const chains = CHAIN_MENTIONS.filter(([, re]) => re.test(text)).map(([k]) => k);
  // Named chains dominate; brand-neutral faces ($ and the Rizon mark) fill in.
  // A caption that names no chain gets neutral coins only.
  return chains.length ? [...chains, ...chains, "mark"] : ["usd", "mark", "usd"];
}

function buildCoin(rng, M) {
  const kind = rng.pick(activeCoinFaces || B.coinFaces);
  const rimMat = kind === "usd" ? M.primary : rng.pick([M.chrome, M.dark, M.primary]);
  const R = 1;
  const T = 0.24;
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 96, 1), rimMat);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const faceTex = coinFaceTexture(kind);
  const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTex, metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.9 });
  for (const side of [1, -1]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 96), faceMat);
    face.position.z = side * (T / 2 + 0.002);
    if (side < 0) face.rotation.y = Math.PI;
    group.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.965, 0.05, 16, 120), rimMat);
    rim.position.z = side * (T / 2);
    group.add(rim);
  }
  return finalize(group);
}

function buildShield(rng, M) {
  const s = new THREE.Shape();
  s.moveTo(0, 1.25);
  s.bezierCurveTo(0.45, 1.04, 0.85, 1.0, 1.05, 1.0);
  s.lineTo(1.05, 0.12);
  s.bezierCurveTo(1.05, -0.62, 0.55, -1.05, 0, -1.32);
  s.bezierCurveTo(-0.55, -1.05, -1.05, -0.62, -1.05, 0.12);
  s.lineTo(-1.05, 1.0);
  s.bezierCurveTo(-0.85, 1.0, -0.45, 1.04, 0, 1.25);
  const group = new THREE.Group();
  const outerMat = rng.chance(0.7) ? M.primary : M.chrome;
  group.add(new THREE.Mesh(extrude(s, 0.32, 0.12, 6), outerMat));
  const inner = new THREE.Mesh(extrude(s, 0.1, 0.05, 4), M.dark);
  inner.scale.set(0.78, 0.78, 1);
  inner.position.z = 0.24;
  group.add(inner);
  if (rng.chance(0.6)) {
    const check = new THREE.Mesh(extrude(polygon(CHECK_PTS), 0.12, 0.04, 3), outerMat === M.primary ? M.primary : M.soft);
    check.scale.setScalar(0.72);
    check.position.set(0, 0.0, 0.36);
    group.add(check);
  } else {
    const lock = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 16, 48, Math.PI), M.chrome);
    ring.position.y = 0.1;
    lock.add(ring);
    const bodyL = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.56, 0.16, 4, 0.06), outerMat === M.primary ? M.primary : M.soft);
    bodyL.position.y = -0.2;
    lock.add(bodyL);
    lock.position.z = 0.36;
    group.add(lock);
  }
  return finalize(group);
}

function buildWallet(rng, M) {
  const group = new THREE.Group();
  const bodyMat = B.dark ? (rng.chance(0.7) ? M.dark : M.primary) : rng.pick([M.primary, M.dark]);
  const accentMat = bodyMat === M.primary ? (B.dark ? M.dark : M.soft) : B.dark ? M.primary : M.soft;
  group.add(new THREE.Mesh(new RoundedBoxGeometry(2.7, 1.95, 0.8, 6, 0.24), bodyMat));
  const cardA = new THREE.Mesh(new RoundedBoxGeometry(2.25, 1.35, 0.05, 2, 0.03), accentMat);
  cardA.position.set(-0.05, 0.62, -0.08);
  cardA.rotation.z = 0.07;
  group.add(cardA);
  const cardB = new THREE.Mesh(new RoundedBoxGeometry(2.25, 1.35, 0.05, 2, 0.03), M.chrome);
  cardB.position.set(0.08, 0.5, 0.06);
  cardB.rotation.z = -0.05;
  group.add(cardB);
  const flap = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.86, 0.3, 4, 0.14), accentMat);
  flap.position.set(0.82, -0.08, 0.42);
  group.add(flap);
  const clasp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 32), M.chrome);
  clasp.rotation.x = Math.PI / 2;
  clasp.position.set(1.12, -0.08, 0.6);
  group.add(clasp);
  return finalize(group);
}

function cardFaceTexture(rng) {
  return canvasTexture(1024, 646, (g, w, h) => {
    g.save();
    g.beginPath();
    g.roundRect(0, 0, w, h, 58);
    g.clip();
    const bg = g.createLinearGradient(0, 0, w, h);
    const p = B.palette;
    bg.addColorStop(0, B.dark ? "#1d1d1d" : p[2]);
    bg.addColorStop(1, B.dark ? "#050505" : p[3]);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.18;
    g.fillStyle = B.dark ? p[2] : p[4];
    g.beginPath();
    g.arc(w * 0.92, h * 0.1, h * 0.75, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = "#ffffff";
    g.font = "800 58px Inter";
    g.fillText(B.logoText, 72, 120);
    // chip
    const chip = g.createLinearGradient(80, 230, 220, 330);
    chip.addColorStop(0, "#f3dc8b");
    chip.addColorStop(1, "#b98f2e");
    g.fillStyle = chip;
    g.beginPath();
    g.roundRect(80, 230, 140, 104, 18);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 3;
    for (const y of [265, 300]) {
      g.beginPath();
      g.moveTo(80, y);
      g.lineTo(220, y);
      g.stroke();
    }
    // contactless
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 7;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(262, 282, 22 + i * 18, -0.8, 0.8);
      g.stroke();
    }
    g.fillStyle = "#ffffff";
    g.font = "500 46px 'JetBrains Mono'";
    g.fillText(`••••  ••••  ••••  ${rng.int(1000, 9999)}`, 80, 470);
    g.font = "700 26px Inter";
    g.globalAlpha = 0.7;
    g.fillText("MERCHANT", 80, 570);
    g.globalAlpha = 1;
    g.font = "900 40px Inter";
    g.textAlign = "right";
    g.fillText("USDC", w - 72, 570);
    g.restore();
  });
}

function buildCard(rng, M) {
  const W = 3.2;
  const H = 2.02;
  const D = 0.07;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.03), B.dark ? M.dark : M.primary));
  const faceMat = new THREE.MeshPhysicalMaterial({ map: cardFaceTexture(rng), alphaTest: 0.5, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), faceMat);
  face.position.z = D / 2 + 0.003;
  group.add(face);
  return finalize(group);
}

function buildBolt(rng, M) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(extrude(polygon(BOLT_PTS), 0.3, 0.1, 5), rng.chance(0.75) ? M.primary : M.chrome));
  return finalize(group);
}

function buildCheckBadge(rng, M) {
  const s = new THREE.Shape();
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 1 + 0.07 * Math.cos(a * 14);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const group = new THREE.Group();
  const outer = rng.chance(0.7) ? M.primary : M.chrome;
  group.add(new THREE.Mesh(extrude(s, 0.22, 0.08, 4), outer));
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.1, 64), M.dark);
  disk.rotation.x = Math.PI / 2;
  disk.position.z = 0.17;
  group.add(disk);
  const check = new THREE.Mesh(extrude(polygon(CHECK_PTS), 0.14, 0.04, 3), outer === M.primary ? M.primary : M.soft);
  check.scale.setScalar(0.8);
  check.position.z = 0.3;
  group.add(check);
  return finalize(group);
}

class StadiumCurve extends THREE.Curve {
  constructor(L, r) {
    super();
    this.L = L;
    this.r = r;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const { L, r } = this;
    const P = 2 * L + 2 * Math.PI * r;
    let s = t * P;
    if (s < L) return target.set(-L / 2 + s, r, 0);
    s -= L;
    if (s < Math.PI * r) {
      const a = Math.PI / 2 - s / r;
      return target.set(L / 2 + r * Math.cos(a), r * Math.sin(a), 0);
    }
    s -= Math.PI * r;
    if (s < L) return target.set(L / 2 - s, -r, 0);
    s -= L;
    const a = -Math.PI / 2 - s / r;
    return target.set(-L / 2 + r * Math.cos(a), r * Math.sin(a), 0);
  }
}
function buildChain(rng, M) {
  const group = new THREE.Group();
  const geo = new THREE.TubeGeometry(new StadiumCurve(0.85, 0.42), 160, 0.14, 18, true);
  const mats = rng.chance(0.5) ? [M.primary, M.chrome, M.primary] : [M.chrome, M.primary, M.chrome];
  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(geo, mats[i]);
    link.position.x = (i - 1) * 1.12;
    link.rotation.x = i % 2 ? Math.PI / 2 : 0;
    group.add(link);
  }
  group.rotation.z = rng.range(-0.5, 0.5);
  return finalize(group);
}

function buildNodes(rng, M) {
  const group = new THREE.Group();
  const center = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), M.primary);
  center.material = center.material.clone();
  center.material.flatShading = true;
  group.add(center);
  const n = rng.int(6, 8);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.6, 0.6)).normalize();
    const p = dir.multiplyScalar(rng.range(1.15, 1.55));
    pts.push(p);
    const node = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.14, 0.26), 32, 16), rng.pick([M.chrome, M.soft, M.primary]));
    node.position.copy(p);
    group.add(node);
  }
  const link = (a, b, r = 0.035) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), M.chrome);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(m);
  };
  pts.forEach((p) => link(new THREE.Vector3(), p, 0.045));
  for (let i = 0; i < pts.length; i++) if (rng.chance(0.5)) link(pts[i], pts[(i + 1) % pts.length]);
  return finalize(group);
}


function buildTrophy(rng, M) {
  const group = new THREE.Group();
  const metal = (rng.chance(0.7) ? M.primary : M.chrome).clone();
  metal.side = THREE.DoubleSide;
  const profile = [[0, 0.62], [0.17, 0.62], [0.13, 0.92], [0.2, 1.06], [0.6, 1.24], [0.84, 1.66], [0.94, 2.2], [0.98, 2.28], [0.9, 2.28], [0.82, 1.82], [0.58, 1.36], [0, 1.3]];
  group.add(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 72), metal));
  for (const s of [1, -1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 16, 48, Math.PI), metal);
    handle.position.set(s * 0.8, 1.86, 0);
    handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(handle);
  }
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.3, 1.25, 4, 0.06), M.dark);
  base.position.y = 0.15;
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.22, 0.85, 4, 0.05), metal);
  plinth.position.y = 0.41;
  group.add(base, plinth);
  return finalize(group);
}

function buildGift(rng, M) {
  const group = new THREE.Group();
  const boxMat = rng.chance(0.6) ? M.primary : M.dark;
  const ribbon = boxMat === M.primary ? (B.dark ? M.dark : M.soft) : M.primary;
  const add = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    group.add(m);
    return m;
  };
  add(new RoundedBoxGeometry(1.8, 1.35, 1.8, 4, 0.08), boxMat, 0.675);
  add(new RoundedBoxGeometry(1.98, 0.36, 1.98, 4, 0.08), boxMat, 1.53);
  add(new THREE.BoxGeometry(0.34, 1.37, 1.83), ribbon, 0.675);
  add(new THREE.BoxGeometry(1.83, 1.37, 0.34), ribbon, 0.675);
  add(new THREE.BoxGeometry(0.34, 0.38, 2.01), ribbon, 1.53);
  add(new THREE.BoxGeometry(2.01, 0.38, 0.34), ribbon, 1.53);
  for (const s of [1, -1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 16, 40), ribbon);
    loop.position.set(s * 0.32, 1.98, 0);
    loop.rotation.z = s * 0.65;
    group.add(loop);
  }
  add(new THREE.SphereGeometry(0.17, 24, 12), ribbon, 1.8);
  return finalize(group);
}

const HERO_BUILDERS = { coin: buildCoin, shield: buildShield, wallet: buildWallet, card: buildCard, bolt: buildBolt, check: buildCheckBadge, chain: buildChain, nodes: buildNodes, trophy: buildTrophy, gift: buildGift };
function buildHero(kind, rng, M) {
  if (!B.heroes.includes(kind)) kind = "coin";
  return HERO_BUILDERS[kind](rng, M);
}

/* ============================================================================
   Layer 3 — phone mockup with a canvas-drawn screen
============================================================================ */
const SCREEN_W = 600; // logical size the mini-UIs are drawn at
const SCREEN_H = 1310;
const SCREEN_SCALE = 1.5; // texture is drawn at 1.5x so text on the phone stays sharp

// Real Rizon app screenshots, grouped by what the caption is about.
const APP_SCREENS = {
  "app-wallet": ["app-wallet"],
  "app-trade": ["app-trade"],
  "app-swap": ["app-swap"],
  "app-market": ["mk-trending", "mk-gaining", "mk-stocks", "mk-rwa", "app-trade"],
  "app-receive": ["rcv-main", "rcv-group"],
  "app-dapp": ["dapp"],
};
const LIGHT_SCREENS = new Set(["mk-trending", "mk-gaining", "mk-stocks", "mk-rwa", "dapp"]);

function screenTheme() {
  return B.dark
    ? { bg: "#0c0c0c", card: "#1a1a1a", line: "#2a2a2a", text: "#f5f5f5", soft: "#9a9a9a", accent: B.palette[2], accentInk: "#0a0a0a", good: "#66bb6a" }
    : { bg: "#ffffff", card: "#f1f5fd", line: "#e2e8f4", text: "#0b1b3f", soft: "#6b7a99", accent: "#2563ff", accentInk: "#ffffff", good: "#16a34a" };
}

function drawScreen(kind, rng) {
  let light = false; // light-theme screenshots are dimmed a little so they don't bloom
  const tex = canvasTexture(SCREEN_W * SCREEN_SCALE, SCREEN_H * SCREEN_SCALE, (g) => {
    g.scale(SCREEN_SCALE, SCREEN_SCALE);
    const W = SCREEN_W;
    const H = SCREEN_H;
    const T = screenTheme();
    const txt = (s, x, y, font, color, align = "left") => {
      g.font = font;
      g.fillStyle = color;
      g.textAlign = align;
      g.fillText(s, x, y);
    };
    const box = (x, y, w, h, r, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      g.roundRect(x, y, w, h, r);
      g.fill();
    };
    const button = (label, y, h = 100) => {
      box(40, y, W - 80, h, h / 2, T.accent);
      txt(label, W / 2, y + h / 2 + 11, "700 32px Inter", T.accentInk, "center");
    };
    const checkGlyph = (cx, cy, s, color, lw) => {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(cx - s * 0.5, cy);
      g.lineTo(cx - s * 0.12, cy + s * 0.38);
      g.lineTo(cx + s * 0.55, cy - s * 0.38);
      g.stroke();
    };
    const avatar = (cx, cy, r, letter, fill = T.accent, ink = T.accentInk) => {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      txt(letter, cx, cy + r * 0.36, `800 ${r}px Inter`, ink, "center");
    };

    // Real app screenshots (Rizon).
    if (APP_SCREENS[kind]) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      const key = rng.pick(APP_SCREENS[kind]);
      light = LIGHT_SCREENS.has(key);
      const img = IMG[key];
      const s = Math.max(W / img.width, H / img.height);
      g.drawImage(img, (W - img.width * s) / 2, 0, img.width * s, img.height * s);
      return;
    }

    g.fillStyle = T.bg;
    g.fillRect(0, 0, W, H);
    // status bar
    txt("9:41", 58, 66, "600 28px Inter", T.text);
    for (let i = 0; i < 4; i++) box(436 + i * 12, 58 - i * 6, 8, 10 + i * 6, 2, T.text);
    g.strokeStyle = T.text;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(500, 40, 50, 26, 7);
    g.stroke();
    box(504, 44, 36, 18, 4, T.text);

    if (kind === "balance") {
      const rizon = B.key === "RIZON";
      avatar(84, 150, 32, rizon ? "M" : "N");
      txt(rizon ? "@maya" : "Nova Store", 134, 162, "700 30px Inter", T.text);
      txt(rizon ? "Total balance" : "Revenue today", 48, 262, "500 28px Inter", T.soft);
      txt(rizon ? "$12,480.32" : "$8,204.50", 46, 346, "800 82px Inter", T.text);
      txt(rizon ? "▲ $312.08 · 2.56%" : "▲ 18% vs yesterday", 48, 400, "600 28px Inter", T.good);
      const acts = rizon ? ["Send", "Receive", "Swap", "Buy"] : ["Link", "QR", "Withdraw", "Invoice"];
      acts.forEach((a, i) => {
        const cx = 98 + i * 135;
        g.fillStyle = i === 0 ? T.accent : T.card;
        g.beginPath();
        g.arc(cx, 500, 48, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = i === 0 ? T.accentInk : T.text;
        g.lineWidth = 6;
        g.lineCap = "round";
        g.beginPath();
        const dir = i === 1 ? 1 : -1;
        g.moveTo(cx, 500 + 18 * dir);
        g.lineTo(cx, 500 - 18 * dir);
        g.moveTo(cx - 14, 500 - 4 * dir);
        g.lineTo(cx, 500 - 18 * dir);
        g.lineTo(cx + 14, 500 - 4 * dir);
        g.stroke();
        txt(a, cx, 586, "600 24px Inter", T.soft, "center");
      });
      txt(rizon ? "Assets" : "Recent payments", 48, 680, "800 32px Inter", T.text);
      const rows = rizon
        ? [["eth", "Ethereum", "2.41 ETH", "$8,120.40"], ["sol", "Solana", "18.6 SOL", "$3,108.22"], ["base", "USDC · Base", "1,251.70", "$1,251.70"]]
        : [["A", "Order #2048", "USDC · Base", "+$86.40"], ["K", "Order #2047", "USDC · Solana", "+$249.00"], ["J", "Invoice #311", "USDC · Base", "+$1,200.00"], ["M", "Order #2046", "USDT · Base", "+$54.10"]];
      rows.forEach(([icon, name, sub, amt], i) => {
        const y = 716 + i * 128;
        box(36, y, W - 72, 112, 26, T.card);
        if (IMG[icon]) g.drawImage(IMG[icon], 64, y + 24, 64, 64);
        else avatar(96, y + 56, 32, icon, T.line, T.text);
        txt(name, 148, y + 50, "700 28px Inter", T.text);
        txt(sub, 148, y + 86, "500 23px Inter", T.soft);
        txt(amt, W - 64, y + 66, "700 28px Inter", rizon ? T.text : T.good, "right");
      });
    } else if (kind === "success") {
      const rizon = B.key === "RIZON";
      const glow = g.createRadialGradient(W / 2, 430, 60, W / 2, 430, 240);
      glow.addColorStop(0, rgba(T.accent, 0.35));
      glow.addColorStop(1, rgba(T.accent, 0));
      g.fillStyle = glow;
      g.fillRect(0, 180, W, 500);
      g.fillStyle = T.accent;
      g.beginPath();
      g.arc(W / 2, 430, 118, 0, Math.PI * 2);
      g.fill();
      checkGlyph(W / 2, 430, 120, T.accentInk, 24);
      txt(rizon ? "Payment sent" : "Payment successful", W / 2, 650, "800 46px Inter", T.text, "center");
      txt(rizon ? "250 USDC" : "$249.00", W / 2, 752, "800 80px Inter", T.text, "center");
      txt(rizon ? "to @maya on Base" : "Paid in USDC on Base", W / 2, 806, "500 28px Inter", T.soft, "center");
      box(36, 860, W - 72, 268, 28, T.card);
      const rows = rizon ? [["To", "@maya"], ["Network", "Base"], ["Fee", "$0.004"], ["Status", "Confirmed"]] : [["Order", "#2048"], ["Customer", "0x7a3F…c91E"], ["Network", "Base"], ["Settled", "Instantly"]];
      rows.forEach(([k, v], i) => {
        txt(k, 70, 920 + i * 62, "500 26px Inter", T.soft);
        txt(v, W - 70, 920 + i * 62, "700 26px Inter", i === 3 ? T.good : T.text, "right");
      });
      button("Done", 1170);
    } else if (kind === "checkout") {
      txt("Nova Store", 48, 170, "800 40px Inter", T.text);
      txt("Order #2048", 48, 214, "500 26px Inter", T.soft);
      const items = [["Wireless Earbuds", "1 ×", "$59.00", B.palette[2]], ["Charging Case", "1 ×", "$19.00", B.palette[4]], ["Shipping", "", "$8.40", T.line]];
      items.forEach(([n, q, p, c], i) => {
        const y = 270 + i * 124;
        box(48, y, 96, 96, 22, rgba(c, 0.85));
        txt(n, 170, y + 44, "700 28px Inter", T.text);
        txt(q ? `${q} 1` : "Standard", 170, y + 80, "500 23px Inter", T.soft);
        txt(p, W - 48, y + 60, "700 28px Inter", T.text, "right");
      });
      box(48, 660, W - 96, 3, 1, T.line);
      txt("Total", 48, 730, "600 30px Inter", T.soft);
      txt("$86.40", W - 48, 736, "800 50px Inter", T.text, "right");
      txt("Pay with", 48, 820, "600 24px Inter", T.soft);
      ["USDC", "USDT", "ETH"].forEach((t, i) => {
        const x = 48 + i * 172;
        box(x, 846, 156, 68, 34, i === 0 ? rgba(T.accent, 0.12) : T.card);
        if (i === 0) {
          g.strokeStyle = T.accent;
          g.lineWidth = 3;
          g.beginPath();
          g.roundRect(x, 846, 156, 68, 34);
          g.stroke();
        }
        txt(t, x + 78, 890, "700 26px Inter", i === 0 ? T.accent : T.text, "center");
      });
      button("Pay $86.40", 980, 108);
      txt("Secured by Zela Pay", W / 2, 1160, "600 24px Inter", T.soft, "center");
    } else if (kind === "qr") {
      const rizon = B.key === "RIZON";
      txt(rizon ? "Receive" : "Scan to pay", W / 2, 170, "800 46px Inter", T.text, "center");
      txt(rizon ? "Scan to send me crypto" : "Nova Store · Order #2048", W / 2, 222, "500 26px Inter", T.soft, "center");
      box(90, 280, 420, 420, 36, "#ffffff");
      const n = 25;
      const m = 14;
      const ox = 90 + (420 - n * m) / 2;
      const oy = 280 + (420 - n * m) / 2;
      g.fillStyle = "#0a0a0a";
      const finder = (fx, fy) => (fx < 7 && fy < 7) || (fx >= n - 7 && fy < 7) || (fx < 7 && fy >= n - 7);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (finder(x, y)) continue;
          if (x > 9 && x < 15 && y > 9 && y < 15) continue;
          if (rng.chance(0.5)) g.fillRect(ox + x * m, oy + y * m, m, m);
        }
      for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
        g.fillRect(ox + fx * m, oy + fy * m, 7 * m, 7 * m);
        g.fillStyle = "#ffffff";
        g.fillRect(ox + (fx + 1) * m, oy + (fy + 1) * m, 5 * m, 5 * m);
        g.fillStyle = "#0a0a0a";
        g.fillRect(ox + (fx + 2) * m, oy + (fy + 2) * m, 3 * m, 3 * m);
      }
      const cx = 300;
      const cy = 490;
      box(cx - 40, cy - 40, 80, 80, 20, rizon ? "#0a0a0a" : "#2563ff");
      if (rizon) g.drawImage(IMG.mark, cx - 30, cy - 30, 60, 60);
      else txt("Z", cx, cy + 16, "900 46px Inter", "#ffffff", "center");
      txt(rizon ? "@maya" : "$86.40 USDC", W / 2, 800, "800 48px Inter", T.text, "center");
      txt("0x7a3F…c91E", W / 2, 852, "500 26px 'JetBrains Mono'", T.soft, "center");
      box(48, 940, 240, 92, 46, T.card);
      box(312, 940, 240, 92, 46, T.card);
      txt("Copy", 168, 997, "700 28px Inter", T.text, "center");
      txt("Share", 432, 997, "700 28px Inter", T.text, "center");
    } else {
      // send
      txt("Send", 48, 170, "800 44px Inter", T.text);
      box(36, 210, W - 72, 120, 28, T.card);
      avatar(100, 270, 36, "M");
      txt("@maya", 156, 264, "700 32px Inter", T.text);
      txt("Verified username", 156, 302, "500 22px Inter", T.good);
      txt("250", W / 2, 520, "800 130px Inter", T.text, "center");
      txt("USDC", W / 2, 580, "700 34px Inter", T.soft, "center");
      box(W / 2 - 120, 610, 240, 58, 29, T.card);
      txt("on Base", W / 2, 648, "600 24px Inter", T.text, "center");
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
      keys.forEach((k, i) => txt(k, 120 + (i % 3) * 180, 770 + Math.floor(i / 3) * 96, "600 44px Inter", T.text, "center"));
      button("Send 250 USDC", 1160);
    }
  });
  tex.userData.light = light;
  return tex;
}

function buildPhone(rng, M, kind) {
  const W = 2.1;
  const H = 4.4;
  const group = new THREE.Group();
  const bodyMat = B.dark ? glossy(rng.pick(["#1b1b1b", "#2a2a2c"]), { metal: 0.85, rough: 0.3 }) : glossy(rng.pick(["#e2e7f1", "#0b1b3f"]), { metal: 0.9, rough: 0.25 });
  const body = new THREE.Mesh(extrude(roundedRect(W, H, 0.36), 0.18, 0.06, 4), bodyMat);
  group.add(body);
  const front = 0.09 + 0.06 + 0.002;
  const glass = new THREE.Mesh(shapePlane(roundedRect(W - 0.06, H - 0.06, 0.33), W, H), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, metalness: 0, clearcoat: 1 }));
  glass.position.z = front;
  group.add(glass);
  const sw = W - 0.18;
  const sh = H - 0.18;
  const screenTex = drawScreen(kind, rng);
  const screenLevel = screenTex.userData.light ? 0.66 : B.dark ? 0.84 : 0.97;
  const screen = new THREE.Mesh(shapePlane(roundedRect(sw, sh, 0.27), sw, sh), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, color: new THREE.Color(screenLevel, screenLevel, screenLevel) }));
  screen.position.z = front + 0.002;
  group.add(screen);
  const island = new THREE.Mesh(shapePlane(roundedRect(0.56, 0.16, 0.08), 0.56, 0.16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, sh / 2 - 0.16, front + 0.004);
  group.add(island);
  for (const [y, h] of [[0.9, 0.5], [0.3, 0.5]]) {
    const btn = new THREE.Mesh(new RoundedBoxGeometry(0.05, h, 0.1, 2, 0.02), bodyMat);
    btn.position.set(-W / 2 - 0.035, y, 0);
    group.add(btn);
  }
  const power = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.75, 0.1, 2, 0.02), bodyMat);
  power.position.set(W / 2 + 0.035, 0.55, 0);
  group.add(power);
  // Glass sheen.
  const sheen = new THREE.Mesh(
    shapePlane(roundedRect(sw, sh, 0.27), sw, sh),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.42, "rgba(255,255,255,0)");
        gr.addColorStop(0.5, "rgba(255,255,255,0.10)");
        gr.addColorStop(0.62, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sheen.position.z = front + 0.006;
  group.add(sheen);
  // Fit by height: the phone's half-height is what must stay inside the hero circle.
  return finalize(group, H / 2 + 0.06);
}

/* ============================================================================
   Layer 1 — backgrounds (10 themes)
============================================================================ */
function backdropTexture(rng) {
  return canvasTexture(512, 512, (g, w, h) => {
    const [base, base2, p, s, a] = B.palette;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, rgba(base2, B.dark ? 0.9 : 1));
    lin.addColorStop(1, rgba(base, 0));
    g.fillStyle = lin;
    g.fillRect(0, 0, w, h);
    const glows = [[p, B.dark ? 0.2 : 0.22], [s, B.dark ? 0.16 : 0.12], [a, B.dark ? 0.1 : 0.28]];
    for (const [c, alpha] of glows) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const r = rng.range(170, 380);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(c, alpha));
      gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  });
}

function sprite(color, opacity, scale, pos, tex = glowTex) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col(color), transparent: true, opacity, depthWrite: false, blending: glowBlend() }));
  s.scale.set(scale, scale, 1);
  s.position.copy(pos);
  return s;
}

function dust(rng, group, n = 350, spread = [50, 34], zr = [-10, -80]) {
  const pos = new Float32Array(n * 3);
  const cols = new Float32Array(n * 3);
  const pal = [B.palette[2], B.palette[4], B.dark ? "#ffffff" : B.palette[3]].map(col);
  for (let i = 0; i < n; i++) {
    pos.set([rng.range(-spread[0], spread[0]), rng.range(-spread[1], spread[1]), rng.range(zr[1], zr[0])], i * 3);
    const c = rng.pick(pal);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.PointsMaterial({ size: rng.range(0.22, 0.4), map: dotTex, vertexColors: true, transparent: true, opacity: B.dark ? 0.9 : 0.55, depthWrite: false, blending: glowBlend() });
  group.add(new THREE.Points(geo, mat));
}

const BACKGROUNDS = {
  "grid-floor"(rng, group) {
    const geo = new THREE.PlaneGeometry(500, 500);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: glowBlend(),
      uniforms: { uColor: { value: col(B.palette[2]) }, uScale: { value: rng.range(2.4, 3.6) }, uOpacity: { value: B.dark ? 0.85 : 0.5 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uScale, uOpacity; varying vec3 vW;
        void main(){ vec2 c = vW.xz / uScale; vec2 gr = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          float line = 1.0 - min(min(gr.x, gr.y), 1.0);
          float fade = smoothstep(150.0, 14.0, length(vW.xz - cameraPosition.xz));
          gl_FragColor = vec4(uColor, line * fade * uOpacity); }`,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.position.set(0, -rng.range(6, 8), -80);
    group.add(floor);
    group.add(sprite(B.palette[2], B.dark ? 0.3 : 0.4, 140, new THREE.Vector3(0, floor.position.y + 4, -120)));
    group.add(sprite(B.palette[4], B.dark ? 0.6 : 0.45, rng.range(40, 60), new THREE.Vector3(rng.range(-25, 25), floor.position.y + 12, -130)));
    dust(rng, group, 260);
    return { pitch: [0.03, 0.08] };
  },

  particles(rng, group) {
    dust(rng, group, 2600, [55, 40], [-6, -100]);
    for (let i = 0; i < 10; i++) group.add(sprite(rng.pick([B.palette[2], B.palette[3], B.palette[4]]), rng.range(0.15, 0.4), rng.range(3, 9), new THREE.Vector3(rng.range(-30, 30), rng.range(-22, 22), rng.range(-20, -60))));
  },

  orbs(rng, group, M) {
    const n = rng.int(7, 11);
    for (let i = 0; i < n; i++) group.add(sprite(rng.pick(B.palette.slice(2)), B.dark ? rng.range(0.1, 0.28) : rng.range(0.25, 0.5), rng.range(14, 36), new THREE.Vector3(rng.range(-34, 34), rng.range(-24, 24), rng.range(-20, -70))));
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.8, 2.6), 48, 24), rng.pick([M.primary, M.dark, M.chrome]));
      s.position.set(rng.sign() * rng.range(12, 26), rng.range(-16, 16), rng.range(-18, -45)); // off-centre, never behind the hero
      group.add(s);
    }
    dust(rng, group, 300);
  },

  "light-beams"(rng, group) {
    const n = rng.int(6, 9);
    const ox = rng.range(-14, 14);
    for (let i = 0; i < n; i++) {
      const geo = new THREE.PlaneGeometry(rng.range(3, 10), 110);
      geo.translate(0, -55, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamTex, color: col(rng.pick([B.palette[2], B.palette[4], B.palette[3]])), transparent: true, opacity: rng.range(0.14, 0.32), depthWrite: false, blending: glowBlend(), side: THREE.DoubleSide }));
      m.position.set(ox + rng.range(-6, 6), 40, rng.range(-30, -55));
      m.rotation.z = rng.range(-0.55, 0.55);
      group.add(m);
    }
    group.add(sprite(B.palette[2], 0.3, 40, new THREE.Vector3(ox, 34, -50)));
    dust(rng, group, 500);
  },

  circuit(rng, group) {
    const tex = canvasTexture(1024, 1024, (g, w) => {
      const color = B.palette[2];
      g.lineCap = "round";
      g.lineJoin = "round";
      g.shadowColor = rgba(color, 0.8);
      g.shadowBlur = B.dark ? 10 : 0;
      const snap = 32;
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (let i = 0; i < 90; i++) {
        let x = Math.round(rng.range(0, w) / snap) * snap;
        let y = Math.round(rng.range(0, w) / snap) * snap;
        g.strokeStyle = rgba(rng.chance(0.75) ? color : B.palette[4], rng.range(0.35, 0.85));
        g.lineWidth = rng.pick([2, 2, 3, 4]);
        g.beginPath();
        g.moveTo(x, y);
        let d = rng.int(0, 3);
        for (let s = 0; s < rng.int(2, 5); s++) {
          const len = rng.int(1, 5) * snap;
          const [dx, dy] = dirs[d];
          x += dx * len;
          y += dy * len;
          g.lineTo(x, y);
          d = rng.chance(0.5) ? rng.int(0, 3) : rng.int(4, 7);
        }
        g.stroke();
        g.fillStyle = g.strokeStyle;
        g.beginPath();
        g.arc(x, y, rng.range(4, 8), 0, Math.PI * 2);
        rng.chance(0.5) ? g.fill() : g.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const x = rng.range(80, w - 200);
        const y = rng.range(80, w - 200);
        const s = rng.range(70, 130);
        g.strokeStyle = rgba(color, 0.7);
        g.lineWidth = 3;
        g.strokeRect(x, y, s, s);
        for (let k = 1; k < 5; k++) {
          g.beginPath();
          g.moveTo(x + (s * k) / 5, y);
          g.lineTo(x + (s * k) / 5, y - 14);
          g.moveTo(x + (s * k) / 5, y + s);
          g.lineTo(x + (s * k) / 5, y + s + 14);
          g.stroke();
        }
      }
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: B.dark ? 0.9 : 0.6, depthWrite: false, blending: glowBlend() }));
    plane.position.set(rng.range(-10, 10), rng.range(-6, 6), -48);
    plane.rotation.set(rng.range(-0.55, -0.1), rng.range(-0.3, 0.3), rng.range(-0.2, 0.2));
    group.add(plane);
    dust(rng, group, 260);
  },

  "gradient-fog"(rng, group) {
    const cloud = canvasTexture(256, 256, (g, w) => {
      for (let i = 0; i < 26; i++) {
        const x = rng.range(w * 0.25, w * 0.75);
        const y = rng.range(w * 0.25, w * 0.75);
        const r = rng.range(30, 90);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(255,255,255,0.22)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, w);
      }
    }, { srgb: false });
    for (let i = 0; i < 18; i++) {
      const s = sprite(rng.pick(B.palette.slice(2)), B.dark ? rng.range(0.06, 0.16) : rng.range(0.2, 0.45), rng.range(26, 64), new THREE.Vector3(rng.range(-40, 40), rng.range(-26, 26), rng.range(-24, -85)), cloud);
      s.material.rotation = rng.range(0, Math.PI * 2);
      group.add(s);
    }
    dust(rng, group, 220);
  },

  "aurora-ribbons"(rng, group) {
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const geo = new THREE.PlaneGeometry(150, rng.range(9, 20), 200, 1);
      const p = geo.attributes.position;
      const [f1, f2, ph1, ph2, amp] = [rng.range(0.03, 0.07), rng.range(0.08, 0.15), rng.range(0, 6), rng.range(0, 6), rng.range(3, 7)];
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        p.setY(k, p.getY(k) + Math.sin(x * f1 + ph1) * amp + Math.sin(x * f2 + ph2) * amp * 0.35);
        p.setZ(k, Math.cos(x * f1 * 0.8 + ph2) * amp);
      }
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: glowBlend(),
        uniforms: { c1: { value: col(rng.pick([B.palette[2], B.palette[4]])) }, c2: { value: col(rng.pick([B.palette[3], B.palette[4], B.palette[2]])) }, uOp: { value: rng.range(0.3, 0.55) * (B.dark ? 1 : 0.7) }, uFreq: { value: rng.range(20, 60) }, uPh: { value: rng.range(0, 6) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform vec3 c1, c2; uniform float uOp, uFreq, uPh;
          void main(){ float edge = pow(sin(vUv.y * 3.14159), 1.6) * smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float streak = 0.55 + 0.45 * sin(vUv.x * uFreq + uPh + vUv.y * 2.0);
            gl_FragColor = vec4(mix(c1, c2, vUv.x), edge * streak * uOp * mix(0.5, 1.0, vUv.y)); }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(rng.range(-10, 10), rng.range(2, 18), rng.range(-35, -65));
      m.rotation.set(rng.range(-0.4, 0.1), 0, rng.range(-0.25, 0.25));
      group.add(m);
    }
    dust(rng, group, 320);
  },

  "hex-lattice"(rng, group) {
    const size = rng.range(1.5, 2.2);
    const cells = [];
    for (let r = -16; r <= 16; r++) for (let q = -26; q <= 26; q++) cells.push([size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r]);
    const ring = new THREE.RingGeometry(size * 0.86, size * 0.98, 6, 1);
    ring.rotateZ(Math.PI / 6);
    const mesh = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ transparent: true, opacity: B.dark ? 0.95 : 0.7, depthWrite: false }), cells.length);
    const fillGeo = new THREE.CircleGeometry(size * 0.8, 6);
    fillGeo.rotateZ(Math.PI / 6);
    const filled = new THREE.InstancedMesh(fillGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: B.dark ? 0.55 : 0.4, depthWrite: false, blending: glowBlend() }), 40);
    const hot = [rng.range(-25, 25), rng.range(-12, 12)];
    const sigma = rng.range(14, 24);
    const baseC = col(B.palette[0]);
    const prim = col(B.palette[2]);
    const m4 = new THREE.Matrix4();
    let f = 0;
    cells.forEach(([x, y], i) => {
      m4.makeTranslation(x, y, 0);
      mesh.setMatrixAt(i, m4);
      const d2 = (x - hot[0]) ** 2 + (y - hot[1]) ** 2;
      const k = Math.exp(-d2 / (sigma * sigma)) * 0.9 + 0.1;
      mesh.setColorAt(i, baseC.clone().lerp(prim, k));
      if (f < 40 && k > 0.45 && rng.chance(0.12)) {
        filled.setMatrixAt(f, m4);
        filled.setColorAt(f, rng.chance(0.7) ? prim : col(B.palette[4]));
        f++;
      }
    });
    filled.count = f;
    const lattice = new THREE.Group();
    lattice.add(mesh, filled);
    lattice.position.set(0, rng.range(-6, 2), -40);
    lattice.rotation.x = rng.pick([-1.05, -0.5, 0]);
    lattice.rotation.z = rng.range(-0.2, 0.2);
    group.add(lattice);
    dust(rng, group, 220);
  },

  "chain-network"(rng, group) {
    const n = 85;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(rng.range(-42, 42), rng.range(-28, 28), rng.range(-12, -80)));
    const segs = [];
    const seen = new Set();
    pts.forEach((p, i) => {
      const near = pts.map((q, j) => [j, p.distanceTo(q)]).filter(([j, d]) => j !== i && d < 17).sort((a, b) => a[1] - b[1]).slice(0, 3);
      for (const [j] of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        segs.push(p.x, p.y, p.z, pts[j].x, pts[j].y, pts[j].z);
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col(B.palette[2]), transparent: true, opacity: B.dark ? 0.4 : 0.35, depthWrite: false, blending: glowBlend() })));
    const nodes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial(), n);
    const m4 = new THREE.Matrix4();
    pts.forEach((p, i) => {
      const s = rng.range(0.6, 2.2);
      m4.compose(p, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      nodes.setMatrixAt(i, m4);
      nodes.setColorAt(i, col(rng.pick([B.palette[2], B.palette[2], B.palette[4], B.dark ? "#ffffff" : B.palette[3]])));
    });
    group.add(nodes);
    for (let i = 0; i < 14; i++) group.add(sprite(B.palette[2], 0.35, rng.range(3, 7), rng.pick(pts)));
  },

  "mesh-terrain"(rng, group) {
    const geo = new THREE.PlaneGeometry(200, 140, 100, 70);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const w = [rng.range(0.04, 0.08), rng.range(0.08, 0.14), rng.range(0, 6), rng.range(0, 6), rng.range(2.5, 5)];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const centre = Math.min(1, Math.abs(x) / 30);
      p.setY(i, (Math.sin(x * w[0] + w[2]) * Math.cos(z * w[1] + w[3]) + Math.sin((x + z) * w[1] * 0.6)) * w[4] * (0.35 + 0.65 * centre));
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col(B.palette[2]), wireframe: true, transparent: true, opacity: B.dark ? 0.32 : 0.28, depthWrite: false, blending: glowBlend() }));
    mesh.position.set(0, -rng.range(8, 11), -60);
    group.add(mesh);
    group.add(sprite(B.palette[4], B.dark ? 0.7 : 0.45, rng.range(45, 70), new THREE.Vector3(rng.range(-20, 20), mesh.position.y + 14, -130)));
    dust(rng, group, 240);
    return { pitch: [0.04, 0.1] };
  },

  candlesticks(rng, group) {
    const up = new THREE.MeshPhysicalMaterial({ color: col(B.palette[2]), metalness: 0.3, roughness: 0.35, emissive: col(B.palette[2]), emissiveIntensity: B.dark ? 0.12 : 0 });
    const down = new THREE.MeshPhysicalMaterial({ color: col(B.dark ? "#3a3a3a" : B.palette[3]), metalness: 0.4, roughness: 0.4 });
    const rows = rng.int(2, 3);
    for (let r = 0; r < rows; r++) {
      const z = -28 - r * 16;
      let price = rng.range(-7, -2) + r * 3;
      const n = 26;
      const step = rng.range(1.6, 2.2);
      for (let i = 0; i < n; i++) {
        const delta = rng.range(-1.6, 2.0);
        const open = price;
        const close = price + delta;
        price = close;
        const isUp = close >= open;
        const h = Math.max(0.25, Math.abs(delta));
        const body = new THREE.Mesh(new THREE.BoxGeometry(step * 0.55, h, step * 0.55), isUp ? up : down);
        body.position.set((i - n / 2) * step, Math.min(open, close) + h / 2 - 3, z);
        const wick = new THREE.Mesh(new THREE.BoxGeometry(0.08, h + rng.range(0.6, 2), 0.08), isUp ? up : down);
        wick.position.copy(body.position);
        group.add(body, wick);
      }
    }
    dust(rng, group, 220);
  },

  tunnel(rng, group) {
    const cx = rng.range(-8, 8);
    const cy = rng.range(-5, 5);
    const sides = rng.chance(0.5) ? 6 : 96;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(rng.range(17, 19), 0.07, 6, sides),
        new THREE.MeshBasicMaterial({ color: col(i % 3 === 0 ? B.palette[4] : B.palette[2]), transparent: true, opacity: (B.dark ? 0.6 : 0.4) * (1 - i / n), depthWrite: false, blending: glowBlend() }),
      );
      ring.position.set(cx + Math.sin(i * 0.35) * 2, cy + Math.cos(i * 0.3) * 1.5, -12 - i * 5);
      ring.rotation.z = i * 0.09;
      group.add(ring);
    }
    group.add(sprite(B.palette[2], B.dark ? 0.35 : 0.3, 30, new THREE.Vector3(cx, cy, -130)));
    dust(rng, group, 420, [30, 24], [-10, -130]);
  },

  "glass-panels"(rng, group) {
    const n = rng.int(6, 10);
    for (let i = 0; i < n; i++) {
      const w = rng.range(6, 16);
      const h = rng.range(8, 20);
      const shape = roundedRect(w, h, Math.min(w, h) * 0.12);
      const pane = new THREE.Group();
      pane.add(
        new THREE.Mesh(
          new THREE.ShapeGeometry(shape, 12),
          new THREE.MeshBasicMaterial({ color: col(rng.pick([B.palette[2], B.palette[4], B.dark ? "#ffffff" : B.palette[3]])), transparent: true, opacity: B.dark ? 0.05 : 0.12, depthWrite: false, side: THREE.DoubleSide }),
        ),
        new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape, 12)),
          new THREE.LineBasicMaterial({ color: col(B.palette[2]), transparent: true, opacity: B.dark ? 0.5 : 0.4, depthWrite: false, blending: glowBlend() }),
        ),
      );
      pane.position.set(rng.range(-26, 26), rng.range(-16, 16), rng.range(-18, -55));
      pane.rotation.set(rng.range(-0.3, 0.3), rng.range(-0.6, 0.6), rng.range(-0.15, 0.15));
      group.add(pane);
    }
    for (let i = 0; i < 3; i++) group.add(sprite(rng.pick([B.palette[2], B.palette[4]]), B.dark ? 0.2 : 0.3, rng.range(20, 34), new THREE.Vector3(rng.range(-25, 25), rng.range(-15, 15), -60)));
    dust(rng, group, 260);
  },

  "coin-rain"(rng, group, M) {
    const n = 90;
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.18, 40), rng.chance(0.6) ? M.primary : M.chrome, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      e.set(rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2));
      q.setFromEuler(e);
      const s = rng.range(0.5, 1.3);
      m4.compose(new THREE.Vector3(rng.range(-34, 34), rng.range(-22, 24), rng.range(-14, -60)), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m4);
    }
    group.add(mesh);
    dust(rng, group, 200);
  },

  confetti(rng, group) {
    const n = 420;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.9), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    const colors = [B.palette[2], B.palette[4], B.palette[3], B.dark ? "#ffffff" : B.palette[2]].map(col);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      e.set(rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2));
      q.setFromEuler(e);
      const s = rng.range(0.6, 1.4);
      m4.compose(new THREE.Vector3(rng.range(-40, 40), rng.range(-28, 28), rng.range(-10, -70)), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, rng.pick(colors));
    }
    group.add(mesh);
    group.add(sprite(B.palette[2], B.dark ? 0.22 : 0.3, 60, new THREE.Vector3(0, 10, -60)));
  },
};

/* ============================================================================
   Composition
============================================================================ */
function screenToWorld(px, py, dist) {
  const v = new THREE.Vector3(px / 512 - 1, 1 - py / 512, 0.5).unproject(camera);
  return v.sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
}
const halfHeightAt = (dist) => dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const pxToWorld = (rPx, dist) => (rPx / 512) * halfHeightAt(dist);

// Put an object at a poster pixel position, sized so its bounding sphere spans rPx.
function place(obj, px, py, rPx, dist, rng, spin = 1) {
  obj.position.copy(screenToWorld(px, py, dist));
  const rW = pxToWorld(rPx, dist);
  obj.scale.setScalar(rW / obj.userData.radius);
  obj.lookAt(camera.position);
  obj.rotateY(rng.range(-0.55, 0.55) * spin);
  obj.rotateX(rng.range(-0.32, 0.32) * spin);
  obj.rotateZ(rng.range(-0.28, 0.28) * spin);
  scene.add(obj);
  return rW;
}
function placeWorld(obj, pos, rPx, rng, spin = 1) {
  const dist = pos.distanceTo(camera.position);
  obj.position.copy(pos);
  obj.scale.setScalar(pxToWorld(rPx, dist) / obj.userData.radius);
  obj.lookAt(camera.position);
  obj.rotateY(rng.range(-0.6, 0.6) * spin);
  obj.rotateX(rng.range(-0.4, 0.4) * spin);
  scene.add(obj);
}

function burstTexture(rng) {
  return canvasTexture(1024, 1024, (g, w) => {
    const c = w / 2;
    const n = rng.int(14, 22);
    const mask = g.createRadialGradient(c, c, 0, c, c, c);
    mask.addColorStop(0, "rgba(255,255,255,0.9)");
    mask.addColorStop(0.6, "rgba(255,255,255,0.25)");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = mask;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wdt = (Math.PI / n) * rng.range(0.35, 0.7);
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a - wdt) * c, c + Math.sin(a - wdt) * c);
      g.lineTo(c + Math.cos(a + wdt) * c, c + Math.sin(a + wdt) * c);
      g.closePath();
      g.fill();
    }
  }, { srgb: false });
}

function compose(L, layoutName, caption, usePhone, phoneKind, rng) {
  const M = materialSet();
  const heroDist = 20;
  let hx = L.hero.x + rng.range(-10, 10);
  let hy = L.hero.y + rng.range(-10, 10);
  let hr = L.hero.r * rng.range(0.95, 1.02);
  const textCx = L.text.x + L.text.w / 2;

  // Focal hero (phone or illustration).
  let focal;
  if (usePhone) {
    // The phone gets its own, larger slot so the screen content is readable.
    hx = L.phone.x + rng.range(-8, 8);
    hy = L.phone.y + rng.range(-8, 8);
    const half = L.phone.h * rng.range(0.97, 1.02); // half-height on the poster, px
    focal = buildPhone(rng, M, phoneKind);
    place(focal, hx, hy, half, heroDist, rng, 0.28); // gentle tilt keeps the screen legible
    hr = half * 0.78; // sizes the glow / set pieces around it
    const side = hx >= textCx ? 1 : -1;
    const companion = buildHero(caption.hero, rng, M);
    const cr = half * 0.3;
    const cx = Math.min(1024 - SAFE - cr, Math.max(SAFE + cr, hx + side * half * 0.5));
    place(companion, cx, hy + half * 0.56, cr, 16.5, rng, 1.1);
  } else {
    focal = buildHero(caption.hero, rng, M);
    place(focal, hx, hy, hr, heroDist, rng, 1);
  }
  const rW = pxToWorld(hr, heroDist);
  const focalPos = focal.position.clone();
  const back = camera.position.clone().sub(focalPos).normalize().multiplyScalar(-1);

  // Glow behind the hero, and a contact glow / shadow under it.
  scene.add(sprite(B.dark ? B.palette[2] : B.palette[4], B.dark ? 0.1 : 0.24, rW * 3.2, focalPos.clone().addScaledVector(back, 4)));
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(rW * 3.2, rW * 3.2),
    new THREE.MeshBasicMaterial({ map: glowTex, color: col(B.dark ? B.palette[2] : B.palette[3]), transparent: true, opacity: B.dark ? 0.1 : 0.16, depthWrite: false, blending: B.dark ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.copy(focalPos).add(new THREE.Vector3(0, -rW * 1.12, 0));
  scene.add(under);

  // Layout-specific set pieces.
  if (L.burst) {
    const burst = new THREE.Mesh(new THREE.PlaneGeometry(rW * 7, rW * 7), new THREE.MeshBasicMaterial({ map: burstTexture(rng), color: col(B.palette[2]), transparent: true, opacity: B.dark ? 0.16 : 0.2, depthWrite: false, blending: glowBlend() }));
    burst.position.copy(focalPos).addScaledVector(back, 6);
    burst.lookAt(camera.position);
    burst.rotateZ(rng.range(0, Math.PI));
    scene.add(burst);
  }
  if (L.orbit) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rW * 2.05, rW * 0.012, 8, 200), new THREE.MeshBasicMaterial({ color: col(B.palette[2]), transparent: true, opacity: B.dark ? 0.7 : 0.55, blending: glowBlend(), depthWrite: false }));
    ring.position.copy(focalPos);
    ring.lookAt(camera.position);
    ring.rotateX(1.15);
    ring.rotateZ(rng.range(-0.25, 0.25));
    ring.updateMatrixWorld();
    scene.add(ring);
    const pool = RELATED[caption.hero] || RELATED.coin;
    const count = rng.int(3, 4);
    const start = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const a = start + (i / count) * Math.PI * 2;
      const p = ring.localToWorld(new THREE.Vector3(Math.cos(a) * rW * 2.05, Math.sin(a) * rW * 2.05, 0));
      placeWorld(buildHero(rng.pick(pool), rng, M), p, hr * rng.range(0.2, 0.28), rng, 1.4);
    }
  }
  if (L.spotlight) {
    const h = 26;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(rW * 1.9, h, 64, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: glowBlend(),
        uniforms: { uColor: { value: col(B.dark ? B.palette[4] : B.palette[2]) }, uOp: { value: B.dark ? 0.16 : 0.2 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOp; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = smoothstep(0.0, 0.25, vUv.y) * (0.3 + 0.7 * (1.0 - vUv.y)) * smoothstep(1.0, 0.85, vUv.y);
            gl_FragColor = vec4(uColor, a * edge * uOp); }`,
      }),
    );
    cone.position.copy(focalPos).add(new THREE.Vector3(0, h / 2 - rW * 0.9, 0));
    scene.add(cone);
  }
  if (L.stack) {
    const pool = RELATED[caption.hero] || RELATED.coin;
    for (const [sx, sy, sr, sd] of L.stack) place(buildHero(rng.pick(pool), rng, M), sx + rng.range(-10, 10), sy + rng.range(-10, 10), sr, sd, rng, 1.2);
  }

  // Supporting elements at different depths.
  const n = L.spotlight ? rng.int(0, 2) : rng.int(2, Math.min(4, L.supports.length));
  const pool = RELATED[caption.hero] || RELATED.coin;
  for (const [sx, sy, sr] of rng.shuffle(L.supports).slice(0, n)) {
    const front = rng.chance(0.25);
    place(buildHero(rng.pick(pool), rng, M), sx + rng.range(-12, 12), sy + rng.range(-12, 12), sr * rng.range(0.8, 1.08), front ? rng.range(16.5, 17.5) : rng.range(25, 34), rng, 1.6);
  }
  return heroDist;
}

/* ============================================================================
   Layer 4 — copy (2D canvas, drawn over the render so text stays crisp)
============================================================================ */
function setFont(ctx, weight, size, tracking = 0, family = "Inter") {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.letterSpacing = `${(tracking * size).toFixed(2)}px`;
}
function parseRich(text) {
  const out = [];
  let accent = false;
  for (const part of text.split(/(\*)/)) {
    if (part === "*") {
      accent = !accent;
      continue;
    }
    for (const w of part.split(/\s+/).filter(Boolean)) out.push({ t: w, accent });
  }
  return out;
}
function wrapTokens(ctx, tokens, maxW) {
  const space = ctx.measureText(" ").width;
  const lines = [];
  let line = [];
  let width = 0;
  for (const tk of tokens) {
    const w = ctx.measureText(tk.t).width;
    if (w > maxW) return null;
    if (line.length && width + space + w > maxW) {
      lines.push(line);
      line = [];
      width = 0;
    }
    width += (line.length ? space : 0) + w;
    line.push({ ...tk, w });
  }
  if (line.length) lines.push(line);
  return lines;
}
function wrapPlain(ctx, text, maxW) {
  return (wrapTokens(ctx, text.split(/\s+/).map((t) => ({ t, accent: false })), maxW) || []).map((l) => l.map((x) => x.t).join(" "));
}

function fitBlock(ctx, tokens, support, box, kicker) {
  const kh = kicker ? 58 : 0;
  let best = null;
  for (let size = box.max; size >= 40; size -= 2) {
    setFont(ctx, 800, size, -0.045);
    const lines = wrapTokens(ctx, tokens, box.w);
    if (!lines || lines.length > 4) continue;
    const lh = Math.round(size * 0.98);
    const ss = Math.max(21, Math.min(30, Math.round(size * 0.29)));
    setFont(ctx, 500, ss);
    const sLines = wrapPlain(ctx, support, Math.min(box.w, 640));
    const sLh = Math.round(ss * 1.42);
    const gap = Math.round(size * 0.3);
    const total = kh + lines.length * lh + gap + sLines.length * sLh;
    best = { size, lines, lh, ss, sLines, sLh, gap, kh, total };
    if (total <= box.h) return best;
  }
  return best;
}

function drawLogo(ctx, L) {
  const { x, y, align } = L.logo;
  const s = 50;
  setFont(ctx, 800, 34, -0.03);
  const textW = ctx.measureText(B.logoText).width;
  const total = s + 12 + textW;
  const left = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  if (B.key === "RIZON") {
    ctx.drawImage(IMG.mark, left, y - s / 2, s, s);
  } else {
    ctx.fillStyle = B.ctaBg;
    ctx.beginPath();
    ctx.roundRect(left, y - s / 2, s, s, 14);
    ctx.fill();
    setFont(ctx, 900, 32, 0);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("Z", left + s / 2, y + 11);
  }
  setFont(ctx, 800, 34, -0.03);
  ctx.textAlign = "left";
  ctx.fillStyle = B.ink;
  ctx.fillText(B.logoText, left + s + 12, y + 12);
}

function drawCta(ctx, label, x, y, align) {
  const h = 68;
  let w;
  let left;
  if (label === "PLAY" && B.key === "RIZON") {
    w = Math.round((IMG.play.width / IMG.play.height) * h);
    left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.drawImage(IMG.play, left, y, w, h);
  } else {
    const text = `${label === "PLAY" ? B.ctaDefault || "Get started" : label}  →`;
    setFont(ctx, 700, 26, -0.01);
    w = Math.ceil(ctx.measureText(text).width) + 68;
    left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.save();
    if (B.dark) {
      ctx.shadowColor = rgba(B.ctaBg, 0.45);
      ctx.shadowBlur = 40;
    } else {
      ctx.shadowColor = rgba(B.ctaBg, 0.35);
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
    }
    ctx.fillStyle = B.ctaBg;
    ctx.beginPath();
    ctx.roundRect(left, y, w, h, h / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = B.ctaInk;
    ctx.textAlign = "left";
    ctx.fillText(text, left + 34, y + h / 2 + 9);
  }
  // Domain under the CTA, aligned with it.
  setFont(ctx, 500, 20, 0, "'JetBrains Mono'");
  ctx.fillStyle = B.inkSoft;
  ctx.textAlign = align;
  ctx.fillText(B.domain, align === "left" ? left + 4 : align === "right" ? left + w - 4 : x, y + h + 32);
  ctx.textAlign = "left";
}

function drawCopy(ctx, L, caption, rng) {
  const box = L.text;
  const tokens = parseRich(caption.headline);
  const kicker = rng.chance(0.6) ? rng.pick(B.kickers[caption.goal]) : null;
  const style = rng.chance(0.38) ? "highlight" : "color";
  const fit = fitBlock(ctx, tokens, caption.support, box, kicker);
  const top = box.valign === "center" ? box.y + (box.h - fit.total) / 2 : box.valign === "bottom" ? box.y + box.h - fit.total : box.y;
  const ax = box.align === "center" ? box.x + box.w / 2 : box.align === "right" ? box.x + box.w : box.x;

  // Soft scrim behind the copy so it reads over any background.
  ctx.save();
  const cx = box.x + box.w / 2;
  const cy = top + fit.total / 2;
  const rx = box.w * 0.75;
  const ry = fit.total * 0.85 + 60;
  ctx.translate(cx, cy);
  ctx.scale(rx / ry, 1);
  const scrim = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
  scrim.addColorStop(0, rgba(B.palette[0], B.dark ? 0.62 : 0.66));
  scrim.addColorStop(0.6, rgba(B.palette[0], B.dark ? 0.4 : 0.42));
  scrim.addColorStop(1, rgba(B.palette[0], 0));
  ctx.fillStyle = scrim;
  ctx.beginPath();
  ctx.arc(0, 0, ry, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Kicker chip.
  if (kicker) {
    const label = kicker.toUpperCase();
    setFont(ctx, 700, 16, 0.12);
    const w = ctx.measureText(label).width + 56;
    const left = box.align === "center" ? ax - w / 2 : box.align === "right" ? ax - w : ax;
    ctx.fillStyle = rgba(B.palette[2], B.dark ? 0.1 : 0.08);
    ctx.strokeStyle = rgba(B.palette[2], 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left, top, w, 38, 19);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = B.palette[2];
    ctx.beginPath();
    ctx.arc(left + 22, top + 19, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = B.dark ? B.ink : B.palette[2];
    ctx.textAlign = "left";
    ctx.fillText(label, left + 36, top + 25);
  }

  // Headline.
  setFont(ctx, 800, fit.size, -0.045);
  const space = ctx.measureText(" ").width;
  fit.lines.forEach((line, i) => {
    const pad = style === "highlight" ? fit.size * 0.16 : 0;
    const edges = line.reduce((n, t, k) => n + (k > 0 && t.accent !== line[k - 1].accent ? 1 : 0), 0);
    const lineW = line.reduce((s, t) => s + t.w, 0) + space * (line.length - 1) + edges * pad;
    let x = box.align === "center" ? ax - lineW / 2 : box.align === "right" ? ax - lineW : ax;
    const base = top + fit.kh + i * fit.lh + fit.size * 0.82;
    const placed = line.map((t, k) => {
      if (k > 0 && t.accent !== line[k - 1].accent) x += pad;
      const p = { ...t, x };
      x += t.w + space;
      return p;
    });
    if (style === "highlight") {
      const acc = placed.filter((t) => t.accent);
      if (acc.length) {
        const x0 = acc[0].x - fit.size * 0.1;
        const x1 = acc[acc.length - 1].x + acc[acc.length - 1].w + fit.size * 0.1;
        ctx.fillStyle = B.palette[2];
        ctx.beginPath();
        ctx.roundRect(x0, base - fit.size * 0.8, x1 - x0, fit.size * 0.98, fit.size * 0.16);
        ctx.fill();
      }
    }
    ctx.save();
    if (B.dark) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 24;
    }
    ctx.textAlign = "left";
    for (const t of placed) {
      ctx.fillStyle = t.accent ? (style === "highlight" ? B.ctaInk : B.palette[2]) : B.ink;
      if (t.accent && style === "highlight") ctx.shadowBlur = 0;
      ctx.fillText(t.t, t.x, base);
    }
    ctx.restore();
  });

  // Supporting line.
  setFont(ctx, 500, fit.ss, 0);
  ctx.fillStyle = B.inkSoft;
  ctx.textAlign = box.align === "center" ? "center" : box.align === "right" ? "right" : "left";
  fit.sLines.forEach((s, j) => ctx.fillText(s, ax, top + fit.kh + fit.lines.length * fit.lh + fit.gap + j * fit.sLh + fit.ss * 0.9));
  ctx.textAlign = "left";

  // CTA.
  if (L.cta.flow) drawCta(ctx, caption.cta, ax, Math.min(top + fit.total + 40, 1024 - SAFE - 68 - 30), L.cta.align);
  else drawCta(ctx, caption.cta, L.cta.x, L.cta.y, L.cta.align);
  drawLogo(ctx, L);
  return { kicker, style, headlineSize: fit.size };
}

/* ============================================================================
   Render one poster
============================================================================ */
const poster = document.getElementById("poster") || Object.assign(document.createElement("canvas"), { width: SIZE, height: SIZE });
const pctx = poster.getContext("2d");

const PHONE_LAYOUTS = ["split", "diagonal", "corner-anchor", "stacked-depth", "orbit"];

const CAMPAIGN_BACKGROUNDS = {
  "prize-pool": ["confetti", "coin-rain", "light-beams"],
  giveaway: ["confetti", "coin-rain"],
  referral: ["chain-network", "confetti"],
  launch: ["light-beams", "tunnel", "glass-panels"],
};
// Campaign values for the poster being rendered: the brand defaults, overridden
// by whatever the UI or batch.js passes in opts.campaign (blank fields are ignored).
const CAMPAIGN_KEYS = ["prize", "bonus", "giveaway", "ends"];
let activeCampaign = {};
const fillCampaign = (c) => {
  const fill = (t) => t.replace(/\{(\w+)\}/g, (m, k) => activeCampaign[k] ?? m);
  return { ...c, headline: fill(c.headline), support: fill(c.support), cta: fill(c.cta) };
};

async function renderPoster(seed, opts = {}) {
  await ready;
  const brandKey = String(opts.brand || currentBrand).toUpperCase();
  B = BRANDS[brandKey] || BRANDS[BRAND];
  const goal = opts.goal || "";
  const rng = makeRng(`${B.key}|${goal}|${seed}`);
  activeCampaign = { ...B.campaign };
  for (const k of CAMPAIGN_KEYS) {
    const v = String(opts.campaign?.[k] ?? "").trim();
    if (v) activeCampaign[k] = v.slice(0, 40);
  }

  // 1) Picks.
  const pool = goal ? B.captions.filter((c) => c.goal === goal) : B.captions;
  const randomCaption = rng.pick(pool);
  // Batch mode passes a running index; stepping by a number coprime with the pool
  // size visits every caption once before any repeats, in a mixed order.
  const step = [7, 11, 13, 17, 19, 23].find((p) => pool.length % p !== 0) || 1;
  const caption = fillCampaign(Number.isInteger(opts.caption) ? pool[(((opts.caption * step) % pool.length) + pool.length) % pool.length] : randomCaption);
  const usePhone = caption.phone ? rng.chance(0.85) : rng.chance(0.15);
  const phoneKind = caption.phone || B.defaultPhone;
  // Phones read best where they get the most room.
  const anyLayout = rng.pick(Object.keys(LAYOUTS));
  const layoutName = usePhone && rng.chance(0.7) ? rng.pick(PHONE_LAYOUTS) : anyLayout;
  const L = LAYOUTS[layoutName];
  activeCoinFaces = coinFacesFor(caption);
  // Campaign posters lean towards celebratory backgrounds.
  const anyBg = rng.pick(Object.keys(BACKGROUNDS));
  const themed = CAMPAIGN_BACKGROUNDS[caption.goal];
  const bgName = themed && rng.chance(0.55) ? rng.pick(themed) : anyBg;

  // 2) Scene.
  clearScene();
  scene.background = backdropTexture(rng);
  scene.fog = new THREE.Fog(col(B.palette[0]), 34, 125);
  scene.environment = envTex;
  scene.environmentIntensity = B.dark ? 0.48 : 0.9;
  scene.add(new THREE.HemisphereLight(0xffffff, col(B.palette[0]), B.dark ? 0.38 : 0.95));
  const key = new THREE.DirectionalLight(0xffffff, B.dark ? 1.75 : 2.2);
  key.position.set(rng.range(3, 8), rng.range(6, 10), 12);
  const rimA = new THREE.DirectionalLight(col(B.palette[2]), B.dark ? 2.4 : 1.8);
  rimA.position.set(-9, 5, -8);
  const rimB = new THREE.DirectionalLight(col(B.dark ? B.palette[3] : B.palette[4]), B.dark ? 2.5 : 1.3);
  rimB.position.set(9, -4, -7);
  scene.add(key, rimA, rimB);

  const bgGroup = new THREE.Group();
  const M = materialSet();
  // Camera (set before the background so its preferences apply).
  camera.fov = rng.range(33, 40);
  const bgPrefs = BACKGROUNDS[bgName](rng, bgGroup, M) || {};
  scene.add(bgGroup);
  const pitch = bgPrefs.pitch ? rng.range(...bgPrefs.pitch) : rng.range(-0.07, 0.07);
  const yaw = rng.range(-0.16, 0.16);
  const R = 20;
  camera.position.set(R * Math.sin(yaw) * Math.cos(pitch), R * Math.sin(pitch), R * Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // 3) Hero, phone and supporting elements.
  const heroDist = compose(L, layoutName, caption, usePhone, phoneKind, rng);

  // 4) Finishing: bloom, DOF, grade.
  bloomPass.strength = B.bloom.strength * rng.range(0.85, 1.15);
  bloomPass.radius = B.bloom.radius;
  bloomPass.threshold = B.bloom.threshold;
  bokehPass.uniforms.focus.value = heroDist;
  bokehPass.uniforms.aperture.value = rng.range(0.0003, 0.0008);
  bokehPass.uniforms.maxblur.value = 0.006;
  const gu = gradePass.uniforms;
  gu.uSeed.value = rng() * 10;
  gu.uVignette.value = B.grade.vignette * (layoutName === "spotlight" ? 1.3 : 1);
  gu.uGrain.value = B.grade.grain;
  gu.uSat.value = B.grade.sat;
  gu.uTint.value.set(B.grade.tint);
  gu.uTintAmt.value = B.grade.tintAmt;
  gu.uVigColor.value.set(B.grade.vigColor);
  composer.render();

  // 5) Copy on top.
  pctx.clearRect(0, 0, SIZE, SIZE);
  pctx.drawImage(glCanvas, 0, 0, SIZE, SIZE);
  const copy = drawCopy(pctx, L, caption, rng);

  return { seed: String(seed), brand: B.key, campaign: { ...activeCampaign }, goal: caption.goal, layout: layoutName, background: bgName, phone: usePhone ? phoneKind : "none", hero: caption.hero, headline: caption.headline.replace(/\*/g, ""), cta: caption.cta, ...copy };
}

const params = new URLSearchParams(location.search);
let currentBrand = (params.get("brand") || BRAND).toUpperCase();
if (!BRANDS[currentBrand]) currentBrand = BRAND;

// Used by batch.js.
window.renderPoster = renderPoster;
window.posterDataURL = () => poster.toDataURL("image/png");
window.posterReady = ready.then(() => true);

/* ============================================================================
   UI
============================================================================ */
const $ = (id) => document.getElementById(id);
if ($("seed")) {
  const seedInput = $("seed");
  const brandSel = $("brand");
  const goalSel = $("goal");
  const busy = $("busy");
  const buttons = ["prev", "next", "render", "random", "download"].map($);
  brandSel.value = currentBrand;
  $("brand-name").textContent = `${BRANDS[currentBrand].name} · ${BRANDS[currentBrand].domain}`;
  document.documentElement.style.setProperty("--accent", BRANDS[currentBrand].dark ? BRANDS[currentBrand].palette[2] : "#7aa2ff");
  if (params.get("seed")) seedInput.value = params.get("seed");
  if (params.get("goal")) goalSel.value = params.get("goal");
  // Campaign fields: placeholders show the brand defaults; typed values override them.
  const campaignInputs = Object.fromEntries(CAMPAIGN_KEYS.map((k) => [k, $(`c-${k}`)]));
  for (const k of CAMPAIGN_KEYS) {
    campaignInputs[k].placeholder = BRANDS[currentBrand].campaign[k];
    if (params.get(k)) campaignInputs[k].value = params.get(k);
  }
  const campaignValues = () => Object.fromEntries(CAMPAIGN_KEYS.map((k) => [k, campaignInputs[k].value.trim()]));
  if (!params.get("seed")) seedInput.value = `${currentBrand.toLowerCase()}-001`;

  let running = false;
  async function run() {
    if (running) return;
    running = true;
    buttons.forEach((b) => (b.disabled = true));
    busy.classList.add("on");
    try {
      const meta = await renderPoster(seedInput.value.trim() || "1", { goal: goalSel.value, campaign: campaignValues() });
      $("meta").innerHTML = Object.entries({ Layout: meta.layout, Background: meta.background, Goal: meta.goal, Hero: meta.hero, Phone: meta.phone, Headline: meta.headline })
        .map(([k, v]) => `<dt>${k}</dt><dd>${String(v).replace(/</g, "&lt;")}</dd>`)
        .join("");
      const u = new URL(location.href);
      u.searchParams.set("brand", currentBrand);
      u.searchParams.set("seed", seedInput.value.trim());
      goalSel.value ? u.searchParams.set("goal", goalSel.value) : u.searchParams.delete("goal");
      for (const [k, v] of Object.entries(campaignValues())) v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
      history.replaceState(null, "", u);
    } catch (e) {
      $("meta").innerHTML = `<dt>Error</dt><dd>${String(e.message || e).replace(/</g, "&lt;")}</dd>`;
      console.error(e);
    } finally {
      running = false;
      buttons.forEach((b) => (b.disabled = false));
      busy.classList.remove("on");
    }
  }
  const step = (d) => {
    const v = seedInput.value.trim();
    const m = v.match(/^(.*?)(\d+)$/);
    seedInput.value = m ? `${m[1]}${String(Math.max(0, Number(m[2]) + d)).padStart(m[2].length, "0")}` : `${v}-${d > 0 ? 1 : 0}`;
    run();
  };
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));
  $("render").addEventListener("click", run);
  $("random").addEventListener("click", () => {
    seedInput.value = `${currentBrand.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
    run();
  });
  seedInput.addEventListener("keydown", (e) => e.key === "Enter" && run());
  goalSel.addEventListener("change", run);
  for (const input of Object.values(campaignInputs)) {
    input.addEventListener("change", run);
    input.addEventListener("keydown", (e) => e.key === "Enter" && run());
  }
  brandSel.addEventListener("change", () => {
    const u = new URL(location.href);
    u.searchParams.set("brand", brandSel.value);
    u.searchParams.delete("seed");
    location.href = u.toString();
  });
  $("download").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = poster.toDataURL("image/png");
    a.download = `${currentBrand.toLowerCase()}-${seedInput.value.trim() || "poster"}.png`;
    a.click();
  });
  run();
}
