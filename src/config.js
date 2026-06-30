// Centralized env + HTTP base for the Coin Clash MCP.
//
// Reads (state, leaderboard) wrap the PUBLIC three.ws Coin Clash API and need
// no secret — point THREE_WS_BASE at a deployment and go. Writes (enlist,
// rally) are wallet-scoped: the soldier must prove they hold the faction coin
// by signing a challenge with their Solana key. That key is supplied per-call
// via the `secret` argument, or once via SOLANA_SECRET_KEY in the server
// environment. We never embed a default key and never sign on anyone's behalf
// without their key.

export function env(key, fallback) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

// Base URL of the three.ws API. Override only when self-hosting or pointing at a
// preview deployment.
export const THREE_WS_BASE = env('THREE_WS_BASE', 'https://three.ws').replace(/\/+$/, '');

// Per-request timeout (ms). The state read does live pump.fun price + community
// fan-outs, and enlist-verify reads on-chain balances — generous enough to ride
// out a cold edge, fast in practice.
export const HTTP_TIMEOUT_MS = (() => {
	const raw = env('THREE_WS_TIMEOUT_MS');
	if (raw === undefined) return 20000;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`THREE_WS_TIMEOUT_MS must be a positive number (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return n;
})();

// Identifies this client to the API in request logs.
export const USER_AGENT = '@three-ws/clash-mcp';

// Optional default signer for the write tools (enlist_faction, rally_faction).
// A base58-encoded 64-byte Solana secret key. Per-call `secret` arguments
// override this. Treat it like cash — it controls the wallet whose coin
// holdings gate enlistment. Absent → reads still work; writes require a `secret`
// arg instead.
export const SOLANA_DEFAULT_SECRET =
	env('SOLANA_SECRET_KEY') || env('CLASH_SOLANA_SECRET') || '';
