const config = require('./config');
const { Keypair } = require('@solana/web3.js');

async function diagnostic() {
    console.log("🔍 Checking Fallback Logic...\n");

    try {
        const decoded = config.arenaWallet.secretKey;
        console.log(`✅ Decoded secret length: ${decoded.length} bytes`);

        if (decoded.length === 64) {
            let kp;
            try {
                kp = Keypair.fromSecretKey(decoded);
                console.log(`✅ Standard load worked! Pubkey: ${kp.publicKey.toBase58()}`);
            } catch (e) {
                console.log(`⚠️ Standard load failed... trying fallback (first 32 bytes)...`);
                try {
                    kp = Keypair.fromSeed(decoded.slice(0, 32));
                    console.log(`✅ Fallback worked! Pubkey: ${kp.publicKey.toBase58()}`);
                    console.log(`ℹ️ This means your array has extra data but the first 32 bytes are a valid seed.`);
                } catch (e2) {
                    console.log(`❌ Fallback also failed: ${e2.message}`);
                }
            }
        } else if (decoded.length === 32) {
            const kp = Keypair.fromSeed(decoded);
            console.log(`✅ Success! Valid 32-byte Seed. Pubkey: ${kp.publicKey.toBase58()}`);
        } else {
            console.log(`❌ Unexpected length: ${decoded.length} bytes.`);
        }
    } catch (error) {
        console.log(`❌ Parsing failed: ${error.message}`);
    }
}

diagnostic();
