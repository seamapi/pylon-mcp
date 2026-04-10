/**
 * Zod schemas for Pylon API responses.
 * These define minimal response shapes to avoid context overflow in LLM clients.
 *
 * Philosophy:
 * - Default responses contain only essential fields for listing/searching
 * - Use pylon_get_* tools to fetch full details for a specific item
 * - Even "full" responses exclude massive fields like body_html
 * - Body content requires explicit fetch via dedicated tool
 */

import { z } from 'zod';

// ============================================================================
// Pagination
// ============================================================================

export const PaginationSchema = z.object({
	cursor: z.string().nullable(),
	has_next_page: z.boolean(),
});

// ============================================================================
// Issue Schemas
// ============================================================================

/**
 * Minimal issue fields for list/search operations.
 * This is what gets returned by default to avoid context overflow.
 */
export const IssueMinimalSchema = z.object({
	id: z.string(),
	number: z.number().optional(),
	title: z.string(),
	state: z.string(),
	link: z.string().optional(),
	created_at: z.string().optional(),
	assignee_id: z.string().nullable().optional(),
	account_id: z.string().nullable().optional(),
	tags: z.array(z.string()).nullable().optional(),
});

/**
 * Standard issue fields - more detail but still excludes body_html.
 * Use for pylon_get_issue when you need details but not the full body.
 */
export const IssueStandardSchema = IssueMinimalSchema.extend({
	assignee_email: z.string().nullable().optional(),
	requester_id: z.string().nullable().optional(),
	requester_email: z.string().nullable().optional(),
	team_id: z.string().nullable().optional(),
	account_external_ids: z
		.array(z.object({ external_id: z.string(), label: z.string().optional() }))
		.nullable()
		.optional(),
	attachment_urls: z.array(z.string()).nullable().optional(),
	author_unverified: z.boolean().optional(),
	business_hours_first_response_seconds: z.number().nullable().optional(),
	business_hours_resolution_seconds: z.number().nullable().optional(),
	business_hours_time_in_status_seconds: z
		.record(z.string(), z.number())
		.nullable()
		.optional(),
	chat_widget_info: z
		.object({ page_url: z.string().optional() })
		.nullable()
		.optional(),
	csat_responses: z
		.array(
			z.object({
				comment: z.string().nullable().optional(),
				score: z.number(),
			}),
		)
		.nullable()
		.optional(),
	custom_fields: z
		.record(
			z.string(),
			z.object({
				slug: z.string(),
				value: z.unknown().nullable().optional(),
				values: z.array(z.unknown()).nullable().optional(),
			}),
		)
		.nullable()
		.optional(),
	customer_portal_visible: z.boolean().optional(),
	external_issues: z
		.array(
			z.object({
				external_id: z.string(),
				link: z.string().optional(),
				source: z.string().optional(),
			}),
		)
		.nullable()
		.optional(),
	first_response_seconds: z.number().nullable().optional(),
	first_response_time: z.string().nullable().optional(),
	latest_message_time: z.string().nullable().optional(),
	number_of_touches: z.number().nullable().optional(),
	resolution_breach_time: z.string().nullable().optional(),
	resolution_seconds: z.number().nullable().optional(),
	resolution_time: z.string().nullable().optional(),
	slack: z
		.object({
			channel_id: z.string().optional(),
			message_ts: z.string().optional(),
			workspace_id: z.string().optional(),
		})
		.nullable()
		.optional(),
	snoozed_until_time: z.string().nullable().optional(),
	source: z.string().optional(),
	time_in_status_seconds: z
		.record(z.string(), z.number())
		.nullable()
		.optional(),
	type: z.string().optional(),
	updated_at: z.string().nullable().optional(),
});

/**
 * Full issue including body - only used when explicitly requested.
 * The body_html is truncated to prevent context overflow.
 */
export const IssueFullSchema = IssueStandardSchema.extend({
	body_html: z.string().nullable().optional(),
});

export type IssueMinimal = z.infer<typeof IssueMinimalSchema>;
export type IssueStandard = z.infer<typeof IssueStandardSchema>;
export type IssueFull = z.infer<typeof IssueFullSchema>;

// ============================================================================
// Account Schemas
// ============================================================================

export const CustomFieldValueSchema = z.object({
	slug: z.string(),
	value: z.unknown().nullable().optional(),
	values: z.array(z.unknown()).nullable().optional(),
});

const ChannelSchema = z.object({
	channel_id: z.string(),
	source: z.string().optional(),
	is_primary: z.boolean().optional(),
	is_internal: z.boolean().optional(),
	mirror_to: z
		.object({
			channel_id: z.string(),
			source: z.string(),
		})
		.nullable()
		.optional(),
});

const ExternalIdSchema = z.object({
	external_id: z.string(),
	label: z.string().optional(),
});

export const AccountSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.string().nullable().optional(),
	domain: z.string().nullable().optional(),
	domains: z.array(z.string()).nullable().optional(),
	primary_domain: z.string().nullable().optional(),
	owner: z
		.object({ id: z.string(), email: z.string().optional() })
		.nullable()
		.optional(),
	tags: z.array(z.string()).nullable().optional(),
	custom_fields: z
		.record(z.string(), CustomFieldValueSchema)
		.nullable()
		.optional(),
	channels: z.array(ChannelSchema).nullable().optional(),
	external_ids: z.array(ExternalIdSchema).nullable().optional(),
	crm_settings: z
		.object({
			details: z
				.array(z.object({ id: z.string(), source: z.string() }))
				.optional(),
		})
		.nullable()
		.optional(),
	is_disabled: z.boolean().nullable().optional(),
	logo_url: z.string().nullable().optional(),
	subaccount_ids: z.array(z.string()).nullable().optional(),
	latest_customer_activity_time: z.string().nullable().optional(),
	created_at: z.string().nullable().optional(),
	updated_at: z.string().nullable().optional(),
});

export type Account = z.infer<typeof AccountSchema>;

// ============================================================================
// Contact Schemas
// ============================================================================

const IntegrationUserIdSchema = z.object({
	integration_id: z.string().optional(),
	user_id: z.string().optional(),
});

export const ContactSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable().optional(),
	emails: z.array(z.string()).nullable().optional(),
	account: z
		.object({ id: z.string(), name: z.string().optional() })
		.nullable()
		.optional(),
	avatar_url: z.string().nullable().optional(),
	portal_role: z.string().nullable().optional(),
	portal_role_id: z.string().nullable().optional(),
	phone_numbers: z.array(z.string()).nullable().optional(),
	primary_phone_number: z.string().nullable().optional(),
	custom_fields: z
		.record(z.string(), CustomFieldValueSchema)
		.nullable()
		.optional(),
	external_ids: z.array(ExternalIdSchema).nullable().optional(),
	integration_user_ids: z.array(IntegrationUserIdSchema).nullable().optional(),
});

export type Contact = z.infer<typeof ContactSchema>;

// ============================================================================
// Tag Schema
// ============================================================================

export const TagSchema = z.object({
	id: z.string(),
	value: z.string(),
	object_type: z.enum(['account', 'issue', 'contact']),
	hex_color: z.string().nullable().optional(),
});

export type Tag = z.infer<typeof TagSchema>;

// ============================================================================
// Team Schema
// ============================================================================

export const TeamMinimalSchema = z.object({
	id: z.string(),
	name: z.string(),
	member_count: z.number().optional(),
});

export const TeamStandardSchema = TeamMinimalSchema.extend({
	users: z
		.array(
			z.object({
				id: z.string(),
				email: z.string(),
			}),
		)
		.optional(),
});

export type TeamMinimal = z.infer<typeof TeamMinimalSchema>;
export type TeamStandard = z.infer<typeof TeamStandardSchema>;

// ============================================================================
// Transform Functions
// ============================================================================

const MAX_BODY_LENGTH = 500;

/**
 * Strips HTML tags and truncates text for previews.
 */
function stripHtmlAndTruncate(
	html: string | null | undefined,
	maxLength: number,
): string {
	if (!html) return '';
	// Remove HTML tags
	const text = html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Extract account_id from nested account object or direct field.
 */
function extractAccountId(
	issue: Record<string, unknown>,
): string | null | undefined {
	if (typeof issue['account_id'] === 'string') {
		return issue['account_id'];
	}
	const account = issue['account'] as { id?: string } | null | undefined;
	return account?.id;
}

/**
 * Extract assignee_id from nested assignee object or direct field.
 */
function extractAssigneeId(
	issue: Record<string, unknown>,
): string | null | undefined {
	if (typeof issue['assignee_id'] === 'string') {
		return issue['assignee_id'];
	}
	const assignee = issue['assignee'] as { id?: string } | null | undefined;
	return assignee?.id ?? null;
}

/**
 * Extract requester_id from nested requester object or direct field.
 */
function extractRequesterId(
	issue: Record<string, unknown>,
): string | null | undefined {
	if (typeof issue['requester_id'] === 'string') {
		return issue['requester_id'];
	}
	const requester = issue['requester'] as { id?: string } | null | undefined;
	return requester?.id ?? null;
}

/**
 * Extract team_id from nested team object or direct field.
 */
function extractTeamId(
	issue: Record<string, unknown>,
): string | null | undefined {
	if (typeof issue['team_id'] === 'string') {
		return issue['team_id'];
	}
	const team = issue['team'] as { id?: string } | null | undefined;
	return team?.id ?? null;
}

/**
 * Transform a raw issue to minimal format.
 */
export function toIssueMinimal(raw: Record<string, unknown>): IssueMinimal {
	return {
		id: raw['id'] as string,
		number: raw['number'] as number | undefined,
		title: raw['title'] as string,
		state: raw['state'] as string,
		link: raw['link'] as string | undefined,
		created_at: raw['created_at'] as string | undefined,
		assignee_id: extractAssigneeId(raw),
		account_id: extractAccountId(raw),
		tags: raw['tags'] as string[] | null | undefined,
	};
}

/**
 * Extract assignee email from nested assignee object.
 */
function extractAssigneeEmail(
	issue: Record<string, unknown>,
): string | null | undefined {
	const assignee = issue['assignee'] as { email?: string } | null | undefined;
	return assignee?.email ?? null;
}

/**
 * Extract requester email from nested requester object.
 */
function extractRequesterEmail(
	issue: Record<string, unknown>,
): string | null | undefined {
	const requester = issue['requester'] as { email?: string } | null | undefined;
	return requester?.email ?? null;
}

/**
 * Extract account external_ids from nested account object.
 */
function extractAccountExternalIds(
	issue: Record<string, unknown>,
): Array<{ external_id: string; label?: string }> | null | undefined {
	const account = issue['account'] as
		| { external_ids?: Array<{ external_id: string; label?: string }> }
		| null
		| undefined;
	return account?.external_ids ?? null;
}

/**
 * Transform a raw issue to standard format (more fields, no body).
 */
export function toIssueStandard(raw: Record<string, unknown>): IssueStandard {
	return {
		...toIssueMinimal(raw),
		assignee_email: extractAssigneeEmail(raw),
		requester_id: extractRequesterId(raw),
		requester_email: extractRequesterEmail(raw),
		team_id: extractTeamId(raw),
		account_external_ids: extractAccountExternalIds(raw),
		attachment_urls: raw['attachment_urls'] as string[] | null | undefined,
		author_unverified: raw['author_unverified'] as boolean | undefined,
		business_hours_first_response_seconds: raw[
			'business_hours_first_response_seconds'
		] as number | null | undefined,
		business_hours_resolution_seconds: raw[
			'business_hours_resolution_seconds'
		] as number | null | undefined,
		business_hours_time_in_status_seconds: raw[
			'business_hours_time_in_status_seconds'
		] as Record<string, number> | null | undefined,
		chat_widget_info: raw['chat_widget_info'] as
			| { page_url?: string }
			| null
			| undefined,
		csat_responses: raw['csat_responses'] as
			| Array<{ comment?: string | null; score: number }>
			| null
			| undefined,
		custom_fields: raw['custom_fields'] as IssueStandard['custom_fields'],
		customer_portal_visible: raw['customer_portal_visible'] as
			| boolean
			| undefined,
		external_issues: raw['external_issues'] as
			| Array<{ external_id: string; link?: string; source?: string }>
			| null
			| undefined,
		first_response_seconds: raw['first_response_seconds'] as
			| number
			| null
			| undefined,
		first_response_time: raw['first_response_time'] as
			| string
			| null
			| undefined,
		latest_message_time: raw['latest_message_time'] as
			| string
			| null
			| undefined,
		number_of_touches: raw['number_of_touches'] as number | null | undefined,
		resolution_breach_time: raw['resolution_breach_time'] as
			| string
			| null
			| undefined,
		resolution_seconds: raw['resolution_seconds'] as number | null | undefined,
		resolution_time: raw['resolution_time'] as string | null | undefined,
		slack: raw['slack'] as
			| { channel_id?: string; message_ts?: string; workspace_id?: string }
			| null
			| undefined,
		snoozed_until_time: raw['snoozed_until_time'] as string | null | undefined,
		source: raw['source'] as string | undefined,
		time_in_status_seconds: raw['time_in_status_seconds'] as
			| Record<string, number>
			| null
			| undefined,
		type: raw['type'] as string | undefined,
		updated_at: raw['updated_at'] as string | null | undefined,
	};
}

/**
 * Transform a raw issue to full format (includes truncated body).
 */
export function toIssueFull(raw: Record<string, unknown>): IssueFull {
	return {
		...toIssueStandard(raw),
		body_html: stripHtmlAndTruncate(
			raw['body_html'] as string | null | undefined,
			MAX_BODY_LENGTH,
		),
	};
}

/**
 * Transform raw account response to typed format.
 */
export function toAccount(raw: Record<string, unknown>): Account {
	return AccountSchema.strip().parse(raw);
}

/**
 * Transform raw contact response to typed format.
 */
export function toContact(raw: Record<string, unknown>): Contact {
	return ContactSchema.strip().parse(raw);
}

/**
 * Transform raw team to minimal format.
 */
export function toTeamMinimal(raw: Record<string, unknown>): TeamMinimal {
	const users = raw['users'] as { id: string; email: string }[] | undefined;
	return {
		id: raw['id'] as string,
		name: raw['name'] as string,
		member_count: users?.length,
	};
}

/**
 * Transform raw team to standard format.
 */
export function toTeamStandard(raw: Record<string, unknown>): TeamStandard {
	return {
		...toTeamMinimal(raw),
		users: raw['users'] as { id: string; email: string }[] | undefined,
	};
}
