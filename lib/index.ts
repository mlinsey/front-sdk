/*
Copyright 2017 Resin.io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/* tslint:disable: max-classes-per-file */

import * as Promise from 'bluebird';
import * as _ from 'lodash';
import * as querystring from 'querystring';
import * as request from 'request-promise';
import TypedError = require('typed-error');

const URL = 'https://api2.frontapp.com';

interface Request {
	reqType: string;
	path: string;
}

type InternalCallback = (err: Error | null, response: any | null) => void;

export class Front {
	// Setup resource paths for catagories.
	// Endpoint paths can require tags passed as parameters, as both mandatory and
	// optional tags.
	// <tag> is a mandatory tag and updates the path dynamically
	// [tag[:tag]] is an optional tag that is used to build query string at the end of the path
	public comment = {
		create: (params: CommentRequest.Create, callback?: Callback<Comment>): Promise<Comment> =>
			this.httpCall({ path: 'conversations/<conversation_id>/comments', reqType: 'POST' }, params, callback),
		get: (params: CommentRequest.Get, callback?: Callback<Comment>): Promise<Comment> =>
			this.httpCall({ path: 'comments/<comment_id>', reqType: 'GET' }, params, callback),
		listMentions: (params: CommentRequest.ListMentions, callback?: Callback<CommentMentions>):
			Promise<CommentMentions> => this.httpCall({ path: 'comments/<comment_id>/mentions', reqType: 'GET' },
			params, callback),
	};

	public conversation = {
		get: (params: ConversationRequest.Get, callback?: Callback<Conversation>): Promise<Conversation> =>
			this.httpCall({ path: 'conversations/<conversation_id>', reqType: 'GET' }, params, callback),
		list: (params?: ConversationRequest.List, callback?: Callback<Conversations>): Promise<Conversations> =>
			this.httpCall({ path: 'conversations[q:page:limit]', reqType: 'GET' }, params, callback),
		listComments: (params: ConversationRequest.ListComments, callback?: Callback<ConversationComments>):
			Promise<ConversationComments> => this.httpCall({ path: 'conversations/<conversation_id>/comments',
			reqType: 'GET' }, params, callback),
		listFollowers: (params: ConversationRequest.ListFollowers,
			callback?: Callback<ConversationFollowers>): Promise<ConversationFollowers> =>
			this.httpCall({ path: 'conversations/<conversation_id>/followers', reqType: 'GET' }, params, callback),
		listInboxes: (params: ConversationRequest.ListInboxes,
			callback?: Callback<ConversationInboxes>): Promise<ConversationInboxes> =>
			this.httpCall({ path: 'conversations/<conversation_id>/inboxes', reqType: 'GET' }, params, callback),
		listMessages: (params: ConversationRequest.ListMessages,
			callback?: Callback<ConversationMessages>): Promise<ConversationMessages> =>
			this.httpCall({ path: 'conversations/<conversation_id>/messages[page:limit]', reqType: 'GET' },
			params, callback),
		update: (params: ConversationRequest.Update, callback?: Callback<void>): Promise<void> =>
			this.httpCall({ path: 'conversations/<conversation_id}', reqType: 'PATCH' }, params, callback),
	};

	public inbox = {
		create: (params: InboxRequest.Create, callback?: Callback<InboxCreation>): Promise<InboxCreation> =>
			this.httpCall({ path: 'inboxes', reqType: 'POST' }, params, callback),
		get: (params: InboxRequest.Get, callback?: Callback<Inbox>): Promise<Inbox> =>
			this.httpCall({ path: 'inboxes/<inbox_id>', reqType: 'GET' }, params, callback),
		list: (callback?: Callback<Inboxes>): Promise<Inboxes> =>
			this.httpCall({ path: 'inboxes', reqType: 'GET' }, null, callback),
		listChannels: (params: InboxRequest.ListChannels, callback?: Callback<InboxChannels>):
			Promise<InboxChannels> => this.httpCall({ path: 'inboxes/<inbox_id>/channels', reqType: 'GET' },
			params, callback),
		listConversations: (params: InboxRequest.ListConversations, callback?: Callback<InboxConversations>):
			Promise<InboxConversations> => this.httpCall({ path: 'inboxes/<inbox_id>/conversations[q:page:limit]',
			reqType: 'GET' }, params, callback),
		listTeammates: (params: InboxRequest.ListTeammates, callback?: Callback<InboxTeammates>):
			Promise<InboxTeammates> => this.httpCall({ path: 'inboxes/<inbox_id>/teammates', reqType: 'GET' },
			params, callback),
	};

	public message = {
		get: (params: MessageRequest.Get, callback?: Callback<Message>): Promise<Message> =>
			this.httpCall({ path: 'messages/<message_id>', reqType: 'GET' }, params, callback),
		receiveCustom: (params: MessageRequest.ReceiveCustom,
			callback?: Callback<ConversationReference>): Promise<ConversationReference> =>
			this.httpCall({ path: 'channels/<channel_id>/incoming_messages', reqType: 'POST' }, params, callback),
		reply: (params: MessageRequest.Reply, callback?: Callback<Status>): Promise<Status> =>
			this.httpCall({ path: 'conversations/<conversation_id>/messages', reqType: 'POST' }, params, callback),
		send: (params: MessageRequest.Send, callback?: Callback<ConversationReference>):
			Promise<ConversationReference> => this.httpCall({ path: 'channels/<channel_id>/messages',
			reqType: 'POST' }, params, callback),
	};

	public topic = {
		listConversations: (params: TopicRequest.ListConversations, callback?: Callback<TopicConversations>):
		Promise<TopicConversations> => this.httpCall({ path: 'topics/<topic_id>/conversations[q:page:limit]',
			reqType: 'GET' }, params, callback),
	};

	private apiKey: string;

	constructor(apiKey: string) {
		// Key.
		this.apiKey = apiKey;
	}

	private httpCall(details: Request, params: any, callback?: InternalCallback): Promise<any | void>  {
		const requestOpts = {
			body: params || {},
			headers: {
				Authorization: `Bearer ${this.apiKey}`
			},
			json: true,
			method: details.reqType,
			url: `${URL}/${this.formatPath(details.path, params)}`
		};

		// Make the request.
		return request(requestOpts).promise().catch((error: any) => {
			// Format this into something useful, if we can.
			throw new FrontError(error);
		}).asCallback(callback);
	}

	private formatPath(path: string, data: RequestData = {}): string {
		let newPath = path;
		const reSearch = (re: RegExp, operation: (matches: RegExpMatchArray) => void) => {
			let matches = path.match(re);
			if (matches) {
				operation(matches);
			}
		};

		// Find the mandatories. If we don't get them, then we error.
		reSearch(/<(.*?)>/g, (mandatoryTags: RegExpMatchArray) => {
			_.map(mandatoryTags, (tag) => {
				const tagName = tag.substring(1, tag.length -1);
				if (!data[tagName]) {
					throw new Error(`Tag ${tag} not found in parameter data`);
				}
				newPath = newPath.replace(tag, data[tagName]);
			});
		});

		// Look for optionals. There should be a max of one as they extend a query
		// string.
		reSearch(/\[(.*?)\]/g, (optionalTags: RegExpMatchArray) => {
			if (optionalTags.length > 1) {
				throw new Error(`Front endpoint ${path} is incorrectly defined`);
			}

			// Add each of these tags to an array used for the query string.
			const trimmedTags = optionalTags[0];
			const tags = trimmedTags.substring(1, trimmedTags.length - 1).split(':');
			const queryTags: { [key: string]: string } = {};

			// Ensure we remove the optional signature.
			newPath = newPath.replace(trimmedTags, '');
			_.each(tags, (tag) => {
				if (data[tag]) {
					queryTags[tag] = data[tag];
				}
			});
			newPath = `${newPath}?${querystring.stringify(queryTags)}`;
		});

		return newPath;
	}
}

export type Callback<T> = (err: Error | null, response: T | null) => void;

export interface Attachment {
	filename: string;
	url: string;
	contentType: string;
	size: number;
	metadata: any;
}

export interface Author {
	_links: Links;
	id: string;
	email: string;
	username: string;
	first_name: string;
	last_name: string;
	is_admin: boolean;
	is_available: boolean;
}

export interface ConversationReference {
	conversation_reference: string;
	status?: string;
}

export class FrontError extends TypedError {
	public name: string;
	public status: number;
	public title: string;
	public message: string;
	public details?: string[];
	[key: string]: number | string | string[] | void;

	constructor(error: any) {
		super(error);

		const frontError = error.error._error;
		if (frontError) {
			_.each([ 'status', 'title', 'message', 'details' ], (key) => {
				if (frontError[key]) {
					this[key] = frontError[key];
				}
			});
		}
	}
}

export interface Links {
	self: string;
	related: {
		channels?: string;
		comments?: string;
		conversation?: string;
		conversations?: string;
		contact?: string;
		events?: string;
		followers?: string;
		inboxes?: string;
		messages?: string;
		message_replied_to?: string;
		mentions?: string;
		teammates?: string;
	};
}

export interface Pagination {
	limit: number;
	next?: string;
	prev?: string;
}

export interface Recipient {
	_links: Links;
	handle: string;
	role: string;
}

export interface Sender {
	contact_id?: string;
	name?: string;
	handle: string;
}

export interface Status {
	status: string;
}

export interface Tag {
	_links: Links;
	id: string;
	name: string;
}

// Channels ///////////////////////////////////////////////////////////////////
export interface Channel {
	_links: Links;
	address: string;
	id: string;
	send_as: string;
	settings?: ChannelSettings;
	type: string;
}

export interface ChannelSettings {
	webhook_url: string;
}

// Comments ///////////////////////////////////////////////////////////////////
export interface Comment {
	_links: Links;
	author: Author;
	body: string;
	id: string;
	posted_at: string;
}

export interface CommentMentions {
	_pagination: Pagination;
	_links: Links;
	_results: Author[];
}

// Used for making requests
export namespace CommentRequest {
	// Request structures /////////////////////////////////////////////////////
	export interface Create {
		conversation_id: string;
		author_id: string;
		body: string;
		[key: string]: string;
	}

	export interface Get {
		comment_id: string;
		[key: string]: string;
	}

	export interface ListMentions {
		comment_id: string;
		[key: string]: string;
	}
}

// Conversations //////////////////////////////////////////////////////////////
export interface Conversation {
	_links: Links;
	id: string;
	subject: string;
	status: string;
	assignee: Author;
	recipient: Recipient;
	tags: Tag[] | void;
	last_message: Message;
	created_at: number;
}

export interface Conversations {
	_pagination: Pagination;
	_links: Links;
	_results: Conversation[];
}

export interface ConversationComments {
	_pagination: Pagination;
	_links: Links;
	_results: Comment[];
}

export interface ConversationInboxes {
	_pagination: Pagination;
	_links: Links;
	_results: Inbox[];
}

export interface ConversationFollowers {
	_pagination: Pagination;
	_links: Links;
	_results: Author[];
}

export interface ConversationMessages {
	_pagination: Pagination;
	_links: Links;
	_results: Message[];
}

export namespace ConversationRequest {
	// Request structures /////////////////////////////////////////////////////
	export interface List {
		q?: string;
		page?: number;
		limit?: number;
		[key: string]: string | number | void;
	}

	export interface Get {
		conversation_id: string;
		[key: string]: string;
	}

	export interface Update {
		conversation_id: string;
		assignee_id?: string;
		inbox_id?: string;
		status?: string;
		tags?: string[];
		[key: string]: string | string[] | void;
	}

	export interface ListComments {
		conversation_id: string;
		[key: string]: string;
	}

	export interface ListInboxes {
		conversation_id: string;
		[key: string]: string;
	}

	export interface ListFollowers {
		conversation_id: string;
		[key: string]: string;
	}

	export interface ListMessages {
		conversation_id: string;
		page?: number;
		limit?: number;
		[key: string]: string | number | void;
	}
}

// Inboxes ////////////////////////////////////////////////////////////////////
export interface Inbox {
	_links: Links;
	address: string;
	id: string;
	name: string;
	send_as: string;
	type: string;
}

export interface Inboxes {
	_pagination: Pagination;
	_links: Links;
	_results: Inbox[];
}

export interface InboxCreation {
	id: string;
	name: string;
}

export interface InboxChannels {
	_pagination: Pagination;
	_links: Links;
	_results: Channel[];
}

export interface InboxConversations {
	_pagination: Pagination;
	_links: Links;
	_results: Conversation[];
}

export interface InboxTeammates {
	_pagination: Pagination;
	_links: Links;
	_results: Author[];
}

export namespace InboxRequest {
	// Request structures /////////////////////////////////////////////////////
	export interface Create {
		name: string;
		teammate_ids?: string[];
		[key: string]: string | string[] | void;
	}

	export interface Get {
		inbox_id: string;
		[key: string]: string;
	}

	export interface ListChannels {
		inbox_id: string;
		[key: string]: string;
	}

	export interface ListConversations {
		inbox_id: string;
		q?: string;
		page?: number;
		limit?: number;
		[key: string]: string | number | void;
	}

	export interface ListTeammates {
		inbox_id: string;
		[key: string]: string;
	}
}

// Messages ///////////////////////////////////////////////////////////////////
export interface Message {
	_links: Links;
	id: string;
	type: string;
	is_inbound: boolean;
	created_at: number;
	blurb: string;
	author: Author;
	recipients: Recipient[];
	body: string;
	text: string;
	attachments: Attachment[];
	metadata: any;
}

export namespace MessageRequest {
	// Request structures /////////////////////////////////////////////////////
	export interface MessageOptions {
		tags?: string[];
		archive?: boolean;
		[key: string]: string[] | boolean | void;
	}

	export interface Get {
		message_id: string;
		[key: string]: string;
	}

	// Base object for message sending.
	export interface SendBase {
		author_id?: string;
		subject?: string;
		body: string;
		text?: string;
		options?: MessageOptions;
		cc?: string[];
		bcc?: string[];
		[key: string]: string | string[] | MessageOptions | void;
	}

	// Send a MessageRequest.
	export interface Send extends SendBase {
		channel_id: string;
		to: string[];
		[key: string]: string | string[] | MessageOptions | void;
	}

	// Send a reply to a ConversationRequest.
	export interface Reply extends SendBase {
		conversation_id: string;
		to?: string[];
		channel_id?: string;
		[key: string]: string | string[] | MessageOptions | void;
	}

	export interface ReceiveCustom {
		channel_id: string;
		sender: Sender;
		subject?: string;
		body: string;
		body_format?: string;
		metadata?: any;
		[key: string]: string | any | void;
	}
}

// Topics /////////////////////////////////////////////////////////////////////
export interface TopicConversations {
	_pagination: Pagination;
	_links: Links;
	_results: Conversation[];
}

export namespace TopicRequest {
	export interface ListConversations {
		topic_id: string;
		q?: string;
		page?: number;
		limit?: number;
		[key: string]: string | number | void;
	}
}

// Export Types ///////////////////////////////////////////////////////////////
export type RequestData =
	CommentRequest.Create | CommentRequest.Get | CommentRequest.ListMentions |
	ConversationRequest.List | ConversationRequest.Get | ConversationRequest.Update |
		ConversationRequest.ListComments | ConversationRequest.ListFollowers |
		ConversationRequest.ListInboxes | ConversationRequest.ListMessages |
	InboxRequest.Create | InboxRequest.Get | InboxRequest.ListChannels |
		InboxRequest.ListConversations | InboxRequest.ListTeammates |
	MessageRequest.Get | MessageRequest.Send | MessageRequest.Reply |
		MessageRequest.ReceiveCustom |
	TopicRequest.ListConversations;

export type ResponseData =
	Attachment | Author | Links | Recipient | Sender | Tag | ConversationReference |
	Comment | CommentMentions |
	Conversation | Conversations | ConversationInboxes | ConversationFollowers |
		ConversationMessages |
	Inbox | Inboxes | InboxCreation | InboxChannels | InboxConversations |
		InboxTeammates |
	Message |
	TopicConversations;