/**
 * OAuth 2.0 authorization code flow for Google.
 *
 * Uses `fetch` (built into Node 22) instead of a wrapper library: the flow only has three
 * steps (redirect, exchange the code for a token, read the profile), so writing it by hand is
 * easier to control and easier to extend with other providers later.
 */

import type { Config } from './config'
import { badRequest, notConfigured } from './errors'

export interface OAuthProvider {
	readonly key: string
	readonly name: string
	readonly authorizeUrl: string
	readonly tokenUrl: string
	readonly profileUrl: string
	readonly scope: string
	/** Google requires the scope to be sent again when exchanging the token. */
	readonly scopeInTokenRequest: boolean
	readonly extraAuthorizeParams: Readonly<Record<string, string>>
	readonly extraTokenParams: Readonly<Record<string, string>>
}

export const GOOGLE: OAuthProvider = {
	key: 'google',
	name: 'Google',
	authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
	scope: 'openid email profile',
	scopeInTokenRequest: true,
	extraAuthorizeParams: { access_type: 'online', prompt: 'select_account' },
	extraTokenParams: {},
}

export const PROVIDERS: Readonly<Record<string, OAuthProvider>> = { google: GOOGLE }

export interface OAuthProfile {
	provider: string
	subject: string
	email?: string
	displayName: string
	avatarUrl?: string
}

/** Timeout for every call out to the provider (15 seconds, same as the Python version). */
const REQUEST_TIMEOUT_MS = 15_000

const DEFAULT_GOOGLE_DISPLAY_NAME = 'Người chơi Google'

export function providerConfigured(config: Config, provider: OAuthProvider): boolean {
	return config.isConfigured(provider.key)
}

export function providerRedirectUri(config: Config, provider: OAuthProvider): string {
	return config.callbackUrl(provider.key)
}

export function getProvider(config: Config, key: string): OAuthProvider {
	const provider = PROVIDERS[key]
	if (!provider) throw badRequest(`Nhà cung cấp đăng nhập không hợp lệ: ${key}`, 'unknown_provider')
	if (!providerConfigured(config, provider)) throw notConfigured(provider.name)
	return provider
}

export function availableProviders(config: Config): string[] {
	return Object.keys(PROVIDERS).filter((key) => providerConfigured(config, PROVIDERS[key]!))
}

export function buildAuthorizeUrl(config: Config, provider: OAuthProvider, state: string): string {
	const params = new URLSearchParams({
		client_id: config.googleClientId,
		redirect_uri: providerRedirectUri(config, provider),
		response_type: 'code',
		scope: provider.scope,
		state,
		...provider.extraAuthorizeParams,
	})
	return `${provider.authorizeUrl}?${params.toString()}`
}

export async function exchangeCode(
	config: Config,
	provider: OAuthProvider,
	code: string,
): Promise<Record<string, unknown>> {
	const data = new URLSearchParams({
		client_id: config.googleClientId,
		client_secret: config.googleClientSecret,
		code,
		grant_type: 'authorization_code',
		redirect_uri: providerRedirectUri(config, provider),
		...provider.extraTokenParams,
	})
	if (provider.scopeInTokenRequest) data.set('scope', provider.scope)

	const response = await fetch(provider.tokenUrl, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
		body: data,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	const body = await response.text()
	if (response.status >= 400) {
		throw badRequest(
			`${provider.name} từ chối đổi mã uỷ quyền: ${body.slice(0, 200)}`,
			'token_exchange_failed',
		)
	}
	return JSON.parse(body) as Record<string, unknown>
}

export async function fetchProfile(
	config: Config,
	provider: OAuthProvider,
	accessToken: string,
): Promise<OAuthProfile> {
	const response = await fetch(provider.profileUrl, {
		headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	const body = await response.text()
	if (response.status >= 400) {
		throw badRequest(`Không đọc được hồ sơ từ ${provider.name}: ${body.slice(0, 200)}`, 'profile_failed')
	}
	return parseGoogleProfile(provider, JSON.parse(body) as Record<string, unknown>)
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

/** Read Google's OpenID Connect profile (`sub`, `email`, `name`, `picture`). */
export function parseGoogleProfile(provider: OAuthProvider, raw: Record<string, unknown>): OAuthProfile {
	const email = optionalString(raw['email'])
	const displayName =
		optionalString(raw['name']) ||
		optionalString(raw['given_name']) ||
		(email ?? '').split('@')[0] ||
		DEFAULT_GOOGLE_DISPLAY_NAME
	const subject = raw['sub'] === undefined || raw['sub'] === null || raw['sub'] === '' ? '' : String(raw['sub'])

	return {
		provider: provider.key,
		subject,
		...(email === undefined ? {} : { email }),
		displayName,
		avatarUrl: optionalString(raw['picture']),
	}
}
