const bs58 = require('bs58').default;

function parseSecret(secret) {
    if (!secret) return new Uint8Array();

    try {
        if (secret.trim().startsWith('[')) {
            return Uint8Array.from(JSON.parse(secret));
        }
        return bs58.decode(secret);
    } catch (e) {
        console.error("Error parsing:", e.message);
        return new Uint8Array();
    }
}

// Test JSON
const jsonArr = "[1, 2, 3]";
console.log("JSON:", parseSecret(jsonArr));

// Test Base58
// "5HHe1HhLgYv8E4W8H8H8H8H8H8H8H8H8H8H8H8H8H8H8" is not necessarily 64 bytes but good for thirst
const base58Str = "11111111111111111111111111111111"; // Valid base58
console.log("Base58:", parseSecret(base58Str));
