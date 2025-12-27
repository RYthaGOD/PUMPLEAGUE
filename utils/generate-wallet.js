/**
 * Wallet Generator Utility
 * Run: node utils/generate-wallet.js
 */

const { Keypair } = require("@solana/web3.js");

// Generate new wallet
const wallet = Keypair.generate();

console.log("\n🔑 NEW SOLANA WALLET GENERATED\n");
console.log("═".repeat(60));
console.log("\nPublic Key (share this):");
console.log(wallet.publicKey.toBase58());
console.log("\nSecret Key (KEEP PRIVATE - add to .env):");
console.log(`[${Array.from(wallet.secretKey).join(",")}]`);
console.log("\n" + "═".repeat(60));
console.log("\n⚠️  SAVE THESE NOW - They cannot be recovered!\n");
console.log("Add to .env file:");
console.log(`ARENA_WALLET_PUBKEY=${wallet.publicKey.toBase58()}`);
console.log(`ARENA_WALLET_SECRET=[${Array.from(wallet.secretKey).join(",")}]`);
console.log("\n💡 Fund this wallet with SOL before running PumpLeague\n");
