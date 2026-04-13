const PYLON_API_BASE = 'https://api.usepylon.com';

// Pylon API allows max 30 days for time range queries
const MAX_TIME_RANGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Validates that a time range does not exceed the maximum allowed duration.
 * @throws Error if the time range exceeds MAX_TIME_RANGE_DAYS
 */
function validateTimeRange(startTime: string, endTime: string): void {
	const start = new Date(startTime);
	const end = new Date(endTime);

	if (Number.isNaN(start.getTime())) {
		throw new Error(
			`Invalid start_time format: ${startTime}. Use RFC3339 format (e.g., 2024-01-01T00:00:00Z)`,
		);
	}
	if (Number.isNaN(end.getTime())) {
		throw new Error(
			`Invalid end_time format: ${endTime}. Use RFC3339 format (e.g., 2024-01-31T00:00:00Z)`,
		);
	}
	if (start >= end) {
		throw new Error('start_time must be before end_time');
	}

	const diffDays = (end.getTime() - start.getTime()) / MS_PER_DAY;
	if (diffDays > MAX_TIME_RANGE_DAYS) {
		throw new Error(
			`Time range cannot exceed ${MAX_TIME_RANGE_DAYS} days. Requested: ${diffDays.toFixed(1)} days. Try a shorter range like 28 days.`,
		);
	}
}

/**
 * Validates time_range operators within a filter object.
 * @throws Error if any time_range exceeds MAX_TIME_RANGE_DAYS
 */
function validateFilterTimeRanges(filter: Record<string, unknown>): void {
	for (const [fieldName, fieldValue] of Object.entries(filter)) {
		if (
			typeof fieldValue === 'object' &&
			fieldValue !== null &&
			!Array.isArray(fieldValue)
		) {
			const fieldObj = fieldValue as Record<string, unknown>;
			if (fieldObj['time_range']) {
				const timeRange = fieldObj['time_range'] as {
					start?: string;
					end?: string;
				};
				if (timeRange.start && timeRange.end) {
					try {
						validateTimeRange(timeRange.start, timeRange.end);
					} catch (error) {
						throw new Error(
							`Invalid time_range for ${fieldName}: ${(error as Error).message}`,
						);
					}
				}
			}
		}
	}
}

/**
 * Valid operators for each field type in Pylon filters.
 * The LLM sometimes hallucinates operators (e.g., "gte" instead of "time_is_after"),
 * so we need to validate and only pass through recognized operators.
 */
const VALID_OPERATORS: Record<string, Set<string>> = {
	// Time fields
	created_at: new Set(['time_is_after', 'time_is_before', 'time_range']),
	resolved_at: new Set(['time_is_after', 'time_is_before', 'time_range']),
	latest_message_activity_at: new Set([
		'time_is_after',
		'time_is_before',
		'time_range',
	]),

	// String search fields (body_html is NOT supported by Pylon API)
	title: new Set(['string_contains', 'string_does_not_contain']),

	// ID fields
	id: new Set(['equals', 'in', 'not_in']),
	account_id: new Set(['equals', 'in', 'not_in', 'is_set', 'is_unset']),
	requester_id: new Set(['equals', 'in', 'not_in', 'is_set', 'is_unset']),
	assignee_id: new Set(['equals', 'in', 'not_in', 'is_set', 'is_unset']),
	team_id: new Set(['equals', 'in', 'not_in', 'is_set', 'is_unset']),
	ticket_form_id: new Set(['equals', 'in', 'not_in', 'is_set', 'is_unset']),
	follower_user_id: new Set(['equals', 'in', 'not_in']),
	follower_contact_id: new Set(['equals', 'in', 'not_in']),

	// Enum/state fields
	state: new Set(['equals', 'in', 'not_in']),
	issue_type: new Set(['equals', 'in', 'not_in']),

	// Tag fields
	tags: new Set(['contains', 'does_not_contain', 'in', 'not_in']),

	// Account-specific fields
	domains: new Set(['contains', 'does_not_contain']),
	name: new Set(['equals', 'string_contains']),
	external_ids: new Set(['equals', 'in', 'not_in', 'is_set', 'is_unset']),

	// Contact-specific fields
	email: new Set(['equals', 'string_contains', 'in', 'not_in']),
};

/**
 * Recursively cleans a filter object by:
 * 1. Removing empty objects and undefined/null values
 * 2. Only keeping valid operators for each field
 * This prevents sending invalid filters to the Pylon API.
 */
function cleanFilter(
	obj: Record<string, unknown>,
): Record<string, unknown> | undefined {
	const result: Record<string, unknown> = {};

	for (const [fieldName, fieldValue] of Object.entries(obj)) {
		if (fieldValue === undefined || fieldValue === null) {
			continue;
		}

		if (typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
			const fieldObj = fieldValue as Record<string, unknown>;
			const validOperators = VALID_OPERATORS[fieldName];

			if (validOperators) {
				// This is a known field - filter to only valid operators
				const cleanedOperators: Record<string, unknown> = {};
				for (const [op, opValue] of Object.entries(fieldObj)) {
					if (
						validOperators.has(op) &&
						opValue !== undefined &&
						opValue !== null
					) {
						cleanedOperators[op] = opValue;
					}
					// Silently drop invalid operators to avoid API errors
				}
				if (Object.keys(cleanedOperators).length > 0) {
					result[fieldName] = cleanedOperators;
				}
			} else {
				// Unknown field - recursively clean but keep it
				const cleaned = cleanFilter(fieldObj);
				if (cleaned && Object.keys(cleaned).length > 0) {
					result[fieldName] = cleaned;
				}
			}
		} else {
			result[fieldName] = fieldValue;
		}
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

// Operators that use `values` (array) instead of `value`
const ARRAY_OPERATORS = new Set(['in', 'not_in']);
// Operators that take no value
const VALUELESS_OPERATORS = new Set(['is_set', 'is_unset']);

/**
 * Converts the MCP nested filter format into the Pylon API's
 * field/operator/value/subfilters format.
 *
 * MCP input:  { tags: { contains: "bug" }, state: { equals: "new" } }
 * Pylon output: {
 *   operator: "and",
 *   subfilters: [
 *     { field: "tags", operator: "contains", value: "bug" },
 *     { field: "state", operator: "equals", value: "new" }
 *   ]
 * }
 */
function toApiFilter(
	cleaned: Record<string, unknown>,
): Record<string, unknown> {
	const conditions: Record<string, unknown>[] = [];

	for (const [fieldName, fieldValue] of Object.entries(cleaned)) {
		if (
			typeof fieldValue !== 'object' ||
			fieldValue === null ||
			Array.isArray(fieldValue)
		) {
			continue;
		}

		const operators = fieldValue as Record<string, unknown>;

		for (const [op, opValue] of Object.entries(operators)) {
			if (op === 'time_range' && typeof opValue === 'object') {
				const range = opValue as { start?: string; end?: string };
				conditions.push({
					field: fieldName,
					operator: op,
					value: range,
				});
			} else if (ARRAY_OPERATORS.has(op)) {
				conditions.push({
					field: fieldName,
					operator: op,
					values: opValue,
				});
			} else if (VALUELESS_OPERATORS.has(op)) {
				conditions.push({
					field: fieldName,
					operator: op,
				});
			} else {
				conditions.push({
					field: fieldName,
					operator: op,
					value: opValue,
				});
			}
		}
	}

	if (conditions.length === 0) {
		return {};
	}
	if (conditions.length === 1) {
		return conditions[0] as Record<string, unknown>;
	}
	return { operator: 'and', subfilters: conditions };
}

export interface PylonConfig {
	apiToken: string;
}

export interface PaginationParams {
	limit?: number;
	cursor?: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		cursor: string | null;
		has_next_page: boolean;
	};
	request_id: string;
}

export interface SingleResponse<T> {
	data: T;
	request_id: string;
}

export interface Organization {
	id: string;
	name: string;
}

export interface Account {
	id: string;
	name: string;
	domains?: string[];
	primary_domain?: string;
	logo_url?: string;
	owner_id?: string;
	channels?: object[];
	custom_fields?: object;
	external_ids?: object[];
	tags?: string[];
}

export interface Contact {
	id: string;
	name: string;
	email?: string;
	emails?: string[];
	avatar_url?: string;
	account?: { id: string; name: string };
	custom_fields?: object;
	portal_role?: string;
}

export interface Issue {
	id: string;
	title: string;
	state: string;
	priority?: string;
	body_html?: string;
	assignee_id?: string;
	team_id?: string;
	account_id?: string;
	contact_id?: string;
	requester_id?: string;
	tags?: string[];
	created_at?: string;
	updated_at?: string;
	customer_portal_visible?: boolean;
	issue_type?: string;
}

export interface IssueThread {
	id: string;
	channel_id?: string;
	issue_id: string;
	name?: string;
	source?: string;
	thread_id?: string;
}

export interface Message {
	id: string;
	message_html: string;
	author: {
		avatar_url?: string;
		name: string;
		contact?: { email: string; id: string };
		user?: { email: string; id: string };
	};
	is_private: boolean;
	source: string;
	thread_id: string;
	timestamp: string;
	file_urls?: string[];
	email_info?: {
		from_email: string;
		to_emails: string[];
		cc_emails?: string[];
		bcc_emails?: string[];
	};
}

export interface Tag {
	id: string;
	value: string;
	object_type: 'account' | 'issue' | 'contact';
	hex_color?: string;
}

export interface Team {
	id: string;
	name: string;
	users: { email: string; id: string }[];
}

export interface User {
	id: string;
	email: string;
	name?: string;
}

export interface KnowledgeBase {
	id: string;
	title: string;
	slug: string;
	default_language: string;
	supported_languages: string[];
}

export interface KbCollection {
	id: string;
	knowledge_base_id: string;
	name: string;
	slug?: string;
}

export interface KbArticle {
	id: string;
	title: string;
	slug: string;
	identifier: string;
	collection_id?: string;
	is_published: boolean;
	url: string;
	current_draft_content_html?: string;
	current_published_content_html?: string;
	last_published_at?: string;
}

export class PylonClient {
	private apiToken: string;

	constructor(config: PylonConfig) {
		this.apiToken = config.apiToken;
	}

	private async request<T>(
		method: string,
		path: string,
		body?: object,
	): Promise<T> {
		const url = `${PYLON_API_BASE}${path}`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		};

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Pylon API error: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		return response.json() as Promise<T>;
	}

	// Organization
	async getMe(): Promise<SingleResponse<Organization>> {
		return this.request<SingleResponse<Organization>>('GET', '/me');
	}

	// Accounts
	async listAccounts(
		params?: PaginationParams,
	): Promise<PaginatedResponse<Account>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<Account>>(
			'GET',
			`/accounts${query ? `?${query}` : ''}`,
		);
	}

	async getAccount(id: string): Promise<SingleResponse<Account>> {
		return this.request<SingleResponse<Account>>('GET', `/accounts/${id}`);
	}

	async createAccount(
		data: Partial<Account> & { name: string },
	): Promise<SingleResponse<Account>> {
		return this.request<SingleResponse<Account>>('POST', '/accounts', data);
	}

	async updateAccount(
		id: string,
		data: Partial<Account>,
	): Promise<SingleResponse<Account>> {
		return this.request<SingleResponse<Account>>(
			'PATCH',
			`/accounts/${id}`,
			data,
		);
	}

	async updateMultipleAccounts(data: {
		account_ids: string[];
		owner_id?: string;
		tags?: string[];
		tags_apply_mode?: 'append_only' | 'remove_only' | 'replace';
		custom_fields?: { slug: string; value?: string; values?: string[] }[];
	}): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'PATCH',
			'/accounts',
			data,
		);
	}

	async deleteAccount(
		id: string,
	): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'DELETE',
			`/accounts/${id}`,
		);
	}

	async searchAccounts(
		filter: object,
		params?: PaginationParams,
	): Promise<PaginatedResponse<Account>> {
		const cleanedFilter = cleanFilter(filter as Record<string, unknown>);
		const apiFilter = cleanedFilter ? toApiFilter(cleanedFilter) : {};
		return this.request<PaginatedResponse<Account>>(
			'POST',
			'/accounts/search',
			{
				filter: apiFilter,
				limit: params?.limit,
				cursor: params?.cursor,
			},
		);
	}

	// Contacts
	async listContacts(
		params?: PaginationParams,
	): Promise<PaginatedResponse<Contact>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<Contact>>(
			'GET',
			`/contacts${query ? `?${query}` : ''}`,
		);
	}

	async getContact(id: string): Promise<SingleResponse<Contact>> {
		return this.request<SingleResponse<Contact>>('GET', `/contacts/${id}`);
	}

	async createContact(
		data: Partial<Contact> & { name: string },
	): Promise<SingleResponse<Contact>> {
		return this.request<SingleResponse<Contact>>('POST', '/contacts', data);
	}

	async updateContact(
		id: string,
		data: Partial<Contact>,
	): Promise<SingleResponse<Contact>> {
		return this.request<SingleResponse<Contact>>(
			'PATCH',
			`/contacts/${id}`,
			data,
		);
	}

	async deleteContact(
		id: string,
	): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'DELETE',
			`/contacts/${id}`,
		);
	}

	async searchContacts(
		filter: object,
		params?: PaginationParams,
	): Promise<PaginatedResponse<Contact>> {
		const cleanedFilter = cleanFilter(filter as Record<string, unknown>);
		const apiFilter = cleanedFilter ? toApiFilter(cleanedFilter) : {};
		return this.request<PaginatedResponse<Contact>>(
			'POST',
			'/contacts/search',
			{
				filter: apiFilter,
				limit: params?.limit,
				cursor: params?.cursor,
			},
		);
	}

	// Issues
	async listIssues(
		startTime: string,
		endTime: string,
		params?: PaginationParams,
	): Promise<PaginatedResponse<Issue>> {
		validateTimeRange(startTime, endTime);
		const searchParams = new URLSearchParams();
		searchParams.set('start_time', startTime);
		searchParams.set('end_time', endTime);
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		return this.request<PaginatedResponse<Issue>>(
			'GET',
			`/issues?${searchParams.toString()}`,
		);
	}

	async getIssue(id: string): Promise<SingleResponse<Issue>> {
		return this.request<SingleResponse<Issue>>('GET', `/issues/${id}`);
	}

	async createIssue(data: {
		title: string;
		body_html: string;
		account_id?: string;
		assignee_id?: string;
		contact_id?: string;
		requester_id?: string;
		user_id?: string;
		tags?: string[];
		attachment_urls?: string[];
		custom_fields?: object[];
		priority?: 'urgent' | 'high' | 'medium' | 'low';
		destination_metadata?: object;
	}): Promise<SingleResponse<Issue>> {
		return this.request<SingleResponse<Issue>>('POST', '/issues', data);
	}

	async updateIssue(
		id: string,
		data: {
			state?: string;
			title?: string;
			tags?: string[];
			assignee_id?: string;
			team_id?: string;
			account_id?: string;
			customer_portal_visible?: boolean;
			priority?: 'urgent' | 'high' | 'medium' | 'low';
			requester_id?: string;
			type?: 'conversation' | 'ticket';
			custom_fields?: { slug: string; value?: string; values?: string[] }[];
		},
	): Promise<SingleResponse<Issue>> {
		return this.request<SingleResponse<Issue>>('PATCH', `/issues/${id}`, data);
	}

	async deleteIssue(id: string): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'DELETE',
			`/issues/${id}`,
		);
	}

	async searchIssues(
		filter: object,
		params?: PaginationParams,
	): Promise<PaginatedResponse<Issue>> {
		const filterRecord = filter as Record<string, unknown>;
		validateFilterTimeRanges(filterRecord);
		const cleanedFilter = cleanFilter(filterRecord);
		const apiFilter = cleanedFilter ? toApiFilter(cleanedFilter) : {};

		// Debug: log filters to stderr (shows in Claude Desktop logs)
		console.error(
			'[pylon-mcp] searchIssues raw:',
			JSON.stringify(filterRecord),
		);
		console.error(
			'[pylon-mcp] searchIssues apiFilter:',
			JSON.stringify(apiFilter),
		);

		return this.request<PaginatedResponse<Issue>>('POST', '/issues/search', {
			filter: apiFilter,
			limit: params?.limit,
			cursor: params?.cursor,
		});
	}

	async snoozeIssue(
		id: string,
		snooze_until: string,
	): Promise<SingleResponse<Issue>> {
		return this.request<SingleResponse<Issue>>('POST', `/issues/${id}/snooze`, {
			snooze_until,
		});
	}

	async getIssueFollowers(
		id: string,
		params?: PaginationParams,
	): Promise<PaginatedResponse<{ id: string; email: string }>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<{ id: string; email: string }>>(
			'GET',
			`/issues/${id}/followers${query ? `?${query}` : ''}`,
		);
	}

	async updateIssueFollowers(
		id: string,
		data: {
			user_ids?: string[];
			contact_ids?: string[];
			operation?: 'add' | 'remove';
		},
	): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'POST',
			`/issues/${id}/followers`,
			data,
		);
	}

	async linkExternalIssue(
		issueId: string,
		data: {
			external_issue_id: string;
			source: string;
			operation?: 'link' | 'unlink';
		},
	): Promise<SingleResponse<Issue>> {
		return this.request<SingleResponse<Issue>>(
			'POST',
			`/issues/${issueId}/external-issues`,
			data,
		);
	}

	// Threads
	async getIssueThreads(
		issueId: string,
		params?: PaginationParams,
	): Promise<PaginatedResponse<IssueThread>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<IssueThread>>(
			'GET',
			`/issues/${issueId}/threads${query ? `?${query}` : ''}`,
		);
	}

	async createIssueThread(
		issueId: string,
		data?: { name?: string },
	): Promise<SingleResponse<IssueThread>> {
		return this.request<SingleResponse<IssueThread>>(
			'POST',
			`/issues/${issueId}/threads`,
			data ?? {},
		);
	}

	// Reply & Notes
	async replyToIssue(
		issueId: string,
		data: {
			body_html: string;
			message_id: string;
			contact_id?: string;
			user_id?: string;
			attachment_urls?: string[];
			custom_source?: {
				created_at?: string;
				external_id?: string;
				metadata?: Record<string, unknown>;
			};
			email_info?: {
				to_emails?: string[];
				cc_emails?: string[];
				bcc_emails?: string[];
			};
		},
	): Promise<SingleResponse<{ id: string; issue_id: string }>> {
		return this.request<SingleResponse<{ id: string; issue_id: string }>>(
			'POST',
			`/issues/${issueId}/reply`,
			data,
		);
	}

	async createInternalNote(
		issueId: string,
		data: {
			body_html: string;
			thread_id?: string;
			message_id?: string;
			user_id?: string;
			attachment_urls?: string[];
		},
	): Promise<SingleResponse<{ id: string; issue_id: string }>> {
		return this.request<SingleResponse<{ id: string; issue_id: string }>>(
			'POST',
			`/issues/${issueId}/note`,
			data,
		);
	}

	// Messages
	async getIssueMessages(
		issueId: string,
		params?: PaginationParams,
	): Promise<PaginatedResponse<Message>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<Message>>(
			'GET',
			`/issues/${issueId}/messages${query ? `?${query}` : ''}`,
		);
	}

	async deleteMessage(
		issueId: string,
		messageId: string,
	): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'DELETE',
			`/issues/${issueId}/messages/${messageId}`,
		);
	}

	async redactMessage(
		issueId: string,
		messageId: string,
	): Promise<SingleResponse<Message>> {
		return this.request<SingleResponse<Message>>(
			'POST',
			`/issues/${issueId}/messages/${messageId}/redact`,
		);
	}

	// Tags
	async listTags(params?: PaginationParams): Promise<PaginatedResponse<Tag>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<Tag>>(
			'GET',
			`/tags${query ? `?${query}` : ''}`,
		);
	}

	async getTag(id: string): Promise<SingleResponse<Tag>> {
		return this.request<SingleResponse<Tag>>('GET', `/tags/${id}`);
	}

	async createTag(data: {
		value: string;
		object_type: 'account' | 'issue' | 'contact';
		hex_color?: string;
	}): Promise<SingleResponse<Tag>> {
		return this.request<SingleResponse<Tag>>('POST', '/tags', data);
	}

	async updateTag(
		id: string,
		data: { value?: string; hex_color?: string },
	): Promise<SingleResponse<Tag>> {
		return this.request<SingleResponse<Tag>>('PATCH', `/tags/${id}`, data);
	}

	async deleteTag(id: string): Promise<SingleResponse<{ success: boolean }>> {
		return this.request<SingleResponse<{ success: boolean }>>(
			'DELETE',
			`/tags/${id}`,
		);
	}

	// Teams
	async listTeams(params?: PaginationParams): Promise<PaginatedResponse<Team>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<Team>>(
			'GET',
			`/teams${query ? `?${query}` : ''}`,
		);
	}

	async getTeam(id: string): Promise<SingleResponse<Team>> {
		return this.request<SingleResponse<Team>>('GET', `/teams/${id}`);
	}

	async createTeam(data: {
		name?: string;
		user_ids?: string[];
	}): Promise<SingleResponse<Team>> {
		return this.request<SingleResponse<Team>>('POST', '/teams', data);
	}

	async updateTeam(
		id: string,
		data: { name?: string; user_ids?: string[] },
	): Promise<SingleResponse<Team>> {
		return this.request<SingleResponse<Team>>('PATCH', `/teams/${id}`, data);
	}

	// Knowledge Bases
	async listKnowledgeBases(
		params?: PaginationParams,
	): Promise<PaginatedResponse<KnowledgeBase>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<KnowledgeBase>>(
			'GET',
			`/knowledge-bases${query ? `?${query}` : ''}`,
		);
	}

	async getKnowledgeBase(id: string): Promise<SingleResponse<KnowledgeBase>> {
		return this.request<SingleResponse<KnowledgeBase>>(
			'GET',
			`/knowledge-bases/${id}`,
		);
	}

	async listKbCollections(
		kbId: string,
	): Promise<PaginatedResponse<KbCollection>> {
		return this.request<PaginatedResponse<KbCollection>>(
			'GET',
			`/knowledge-bases/${kbId}/collections`,
		);
	}

	async createKbCollection(
		kbId: string,
		data: { name: string; slug?: string },
	): Promise<SingleResponse<KbCollection>> {
		return this.request<SingleResponse<KbCollection>>(
			'POST',
			`/knowledge-bases/${kbId}/collections`,
			data,
		);
	}

	async deleteKbCollection(
		kbId: string,
		collectionId: string,
	): Promise<{ request_id: string }> {
		return this.request<{ request_id: string }>(
			'DELETE',
			`/knowledge-bases/${kbId}/collections/${collectionId}`,
		);
	}

	async listKbArticles(
		kbId: string,
		params?: PaginationParams & { language?: string },
	): Promise<PaginatedResponse<KbArticle>> {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.set('limit', params.limit.toString());
		if (params?.cursor) searchParams.set('cursor', params.cursor);
		if (params?.language) searchParams.set('language', params.language);
		const query = searchParams.toString();
		return this.request<PaginatedResponse<KbArticle>>(
			'GET',
			`/knowledge-bases/${kbId}/articles${query ? `?${query}` : ''}`,
		);
	}

	async createKbArticle(
		kbId: string,
		data: {
			title: string;
			body_html: string;
			author_user_id: string;
			collection_id?: string;
			slug?: string;
			is_published?: boolean;
			is_unlisted?: boolean;
		},
	): Promise<SingleResponse<KbArticle>> {
		return this.request<SingleResponse<KbArticle>>(
			'POST',
			`/knowledge-bases/${kbId}/articles`,
			data,
		);
	}

	async getKbArticle(
		kbId: string,
		articleId: string,
		language?: string,
	): Promise<SingleResponse<KbArticle>> {
		const query = language ? `?language=${encodeURIComponent(language)}` : '';
		return this.request<SingleResponse<KbArticle>>(
			'GET',
			`/knowledge-bases/${kbId}/articles/${articleId}${query}`,
		);
	}

	async updateKbArticle(
		kbId: string,
		articleId: string,
		data: {
			title?: string;
			body_html?: string;
			collection_id?: string;
			slug?: string;
			is_published?: boolean;
			is_unlisted?: boolean;
		},
	): Promise<SingleResponse<KbArticle>> {
		return this.request<SingleResponse<KbArticle>>(
			'PATCH',
			`/knowledge-bases/${kbId}/articles/${articleId}`,
			data,
		);
	}

	async deleteKbArticle(
		kbId: string,
		articleId: string,
	): Promise<{ request_id: string }> {
		return this.request<{ request_id: string }>(
			'DELETE',
			`/knowledge-bases/${kbId}/articles/${articleId}`,
		);
	}

	async createKbRouteRedirect(
		kbId: string,
		data: { from_path: string; to_path: string },
	): Promise<
		SingleResponse<{ id: string; from_path: string; to_path: string }>
	> {
		return this.request<
			SingleResponse<{ id: string; from_path: string; to_path: string }>
		>('POST', `/knowledge-bases/${kbId}/route-redirects`, data);
	}
}
