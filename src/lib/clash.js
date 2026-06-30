// Coin Clash flow helpers shared by the write tools.
//
// Enlisting is a three-step proof, collapsed here into one agent-facing call:
//   1. POST /api/clash/enlist         → a challenge bound to wallet + faction
//   2. sign the challenge locally     → ed25519 proof of wallet ownership
//   3. POST /api/clash/enlist-verify  → server checks the signature + a live
//                                       on-chain holding, then seals a war pass
// The war pass is the credential the rally endpoint trusts (so it never re-runs
// Solana RPC on every tap). rally_faction can take a pass directly, or auto-run
// this flow from a `secret` when none is supplied.

import { apiRequest } from './api.js';
import { loadSigner, signMessage } from './signer.js';

/**
 * Run the full enlist flow for a faction and return the verification result.
 * Resolves the signer's wallet from the secret, so the caller only needs the
 * faction mint.
 *
 * @param {{ token: string, secret?: string }} args
 * @returns {Promise<{
 *   eligible: boolean,
 *   wallet: string,
 *   faction: string,
 *   amount: number,
 *   usd: number,
 *   warPass: string|null,
 *   reason: string|null,
 *   challengeExpiresAt: number|null,
 * }>}
 */
export async function enlist({ token, secret }) {
	const faction = String(token || '').trim();
	if (!faction) {
		throw Object.assign(new Error('A faction token (mint) is required to enlist.'), {
			code: 'validation_error',
		});
	}

	// Resolve the wallet from the signer up front so a missing/invalid key fails
	// loudly before we issue a challenge.
	const { wallet } = loadSigner(secret);

	// 1) Issue a challenge bound to this exact wallet + faction.
	const issued = await apiRequest('/api/clash/enlist', {
		method: 'POST',
		body: { token: faction, wallet },
	});
	const message = issued?.data?.message;
	const challengeExpiresAt = issued?.data?.expiresAt ?? null;
	if (!message) {
		throw Object.assign(new Error('enlist did not return a challenge to sign.'), {
			code: 'upstream_error',
		});
	}

	// 2) Sign the exact challenge text.
	const { signature } = signMessage(message, secret);

	// 3) Verify the signature + prove a live holding → war pass (or ineligible).
	const verified = await apiRequest('/api/clash/enlist-verify', {
		method: 'POST',
		body: { token: faction, wallet, message, signature },
	});
	const d = verified?.data ?? {};

	return {
		eligible: Boolean(d.eligible),
		wallet,
		faction,
		amount: Number(d.amount) || 0,
		usd: Number(d.usd) || 0,
		warPass: d.warPass ?? null,
		reason: d.reason ?? (d.eligible ? null : 'not_eligible'),
		challengeExpiresAt,
	};
}
