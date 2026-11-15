import { apiFetch } from "./api-client.js";
export interface ChatPerson { id:string; fullName:string; email?:string; role?:string; }
export interface ChatMessage { id:string; body:string; kind:"TEXT"|"SYSTEM"; createdAt:string; sender:{id:string;fullName:string}; reactions?:Array<{id:string;emoji:string;user:{id:string;fullName:string}}>; replyTo?:{id:string;body:string;sender:{fullName:string}}|null; }
export interface ChatConversation { id:string; kind:"DIRECT"|"GROUP"; title:string|null; description?:string|null; myRole?:string; unreadCount:number; lastMessage?:ChatMessage|null; lastMessageAt?:string|null; participants:Array<{id:string;user:ChatPerson;role:string}>; }
export const getChatConversations=()=>apiFetch<{data:ChatConversation[]}>("/chat/conversations");
export const getChatDirectory=(search="")=>apiFetch<{data:ChatPerson[]}>(`/chat/directory?search=${encodeURIComponent(search)}`);
export const getChatMessages=(id:string)=>apiFetch<{data:ChatMessage[]}>(`/chat/conversations/${encodeURIComponent(id)}/messages`);
export const startDirectChat=(id:string)=>apiFetch<{data:ChatConversation}>(`/chat/direct/${encodeURIComponent(id)}`,{method:"POST",body:"{}"});
export const createChatGroup=(input:{title:string;participantIds:string[];includeAllEligible:boolean;confirmLargeGroup:boolean})=>apiFetch<{data:ChatConversation}>("/chat/groups",{method:"POST",body:JSON.stringify(input)});
export const sendChatMessage=(id:string,body:string)=>apiFetch<{data:ChatMessage}>(`/chat/conversations/${encodeURIComponent(id)}/messages`,{method:"POST",body:JSON.stringify({body,clientMessageId:crypto.randomUUID()})});
export const markChatRead=(id:string)=>apiFetch<void>(`/chat/conversations/${encodeURIComponent(id)}/read`,{method:"POST",body:"{}"});
