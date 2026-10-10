// Solana message signing for the Coin Clash write path.
//
// Enlisting is a Sign-In-with-Solana style proof: the server hands back a
// challenge string bound to a wallet + faction, and the soldier signs it with
// the wallet's ed25519 key. The backend verifies the signature, then confirms a
// live on-chain holding of the faction coin before issuing a war pass.
//
// We sign the raw UTF-8 message bytes (ed25519, detached) and return a base58
// signature — exactly what api/_lib/siws.js#verifySiwsSignature accepts. No RPC,
// no transaction: this module only proves key ownership. The on-chain balance
// check happens server-side.

import nacl from 'tweetnacl';
import bs58 from 'bs58';

const bs58decode = bs58.default ? bs58.default.decode : bs58.decode;
const bs58encode = bs58.default ? bs58.default.encode : bs58.encode;

import { SOLANA_DEFAULT_SECRET } from '../config.js';

/**
 * Load a signer from a base58-encoded 64-byte Solana secret key. Falls back to
 * SOLANA_SECRET_KEY (SOLANA_DEFAULT_SECRET) when no per-call secret is given.
 * @param {string} [secret] base58 secret key
 * @returns {{ wallet: string, secretKey: Uint8Array }}
 */
export function loadSigner(secret) {
	const trimmed = String(secret || SOLANA_DEFAULT_SECRET || '').trim();
	if (!trimmed) {
		throw Object.assign(
			new Error(
				'Solana secret required to enlist or rally. Pass `secret` (base58) in the tool call, ' +
					'or set SOLANA_SECRET_KEY in the MCP server environment.',
			),
			{ code: 'no_signer' },
		);
	}

	let bytes;
	try {
		bytes = bs58decode(trimmed);
	} catch {
		throw Object.assign(new Error('Solana secret is not valid base58.'), { code: 'invalid_secret' });
	}
	if (bytes.length !== 64) {
		throw Object.assign(
			new Error(`Solana secret must decode to 64 bytes (got ${bytes.length}).`),
			{ code: 'invalid_secret' },
		);
	}

	const pair = nacl.sign.keyPair.fromSecretKey(Uint8Array.from(bytes));
	return { wallet: bs58encode(pair.publicKey), secretKey: pair.secretKey };
}

/**
 * Sign a challenge message with the loaded signer's key.
 * @param {string} message the exact challenge text returned by the enlist call
 * @param {string} [secret] base58 secret key (else env default)
 * @returns {{ wallet: string, signature: string }} base58 detached signature
 */
export function signMessage(message, secret) {
	const { wallet, secretKey } = loadSigner(secret);
	const msgBytes = new TextEncoder().encode(String(message));
	const sig = nacl.sign.detached(msgBytes, secretKey);
	return { wallet, signature: bs58encode(sig) };
}
