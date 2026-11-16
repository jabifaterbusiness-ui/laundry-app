import { apiFetch, apiFetchBlob } from "./api-client.js";
import { useAuthStore } from "../state/auth-store.js";
const auth = () => ({ accessToken: useAuthStore.getState().accessToken });
export interface ChatPerson { id:string; fullName:string; email?:string; role?:string; }
export interface ChatAttachment { id:string; originalName:string; safeMimeType:string; sizeBytes:number; }
export interface ChatMessage { id:string; body:string; kind:"TEXT"|"SYSTEM"; createdAt:string; sender:{id:string;fullName:string}; attachments?:ChatAttachment[]; reactions?:Array<{id:string;emoji:string;user:{id:string;fullName:string}}>; replyTo?:{id:string;body:string;sender:{fullName:string}}|null; }
export interface ChatConversation { id:string; kind:"DIRECT"|"GROUP"; title:string|null; description?:string|null; myRole?:string; unreadCount:number; lastMessage?:ChatMessage|null; lastMessageAt?:string|null; participants:Array<{id:string;user:ChatPerson;role:string}>; }
export const getChatConversations=()=>apiFetch<{data:ChatConversation[]}>("/chat/conversations",auth());
export const getChatDirectory=(search="")=>apiFetch<{data:ChatPerson[]}>(`/chat/directory?search=${encodeURIComponent(search)}`,auth());
export const getChatMessages=(id:string)=>apiFetch<{data:ChatMessage[]}>(`/chat/conversations/${encodeURIComponent(id)}/messages`,auth());
export const startDirectChat=(id:string)=>apiFetch<{data:ChatConversation}>(`/chat/direct/${encodeURIComponent(id)}`,{...auth(),method:"POST",body:"{}"});
export const createChatGroup=(input:{title:string;description?:string;participantIds:string[];includeAllEligible:boolean;confirmLargeGroup:boolean})=>apiFetch<{data:ChatConversation}>("/chat/groups",{...auth(),method:"POST",body:JSON.stringify(input)});
export const sendChatMessage=(id:string,body:string,attachmentIds:string[]=[],replyToMessageId?:string)=>apiFetch<{data:ChatMessage}>(`/chat/conversations/${encodeURIComponent(id)}/messages`,{...auth(),method:"POST",body:JSON.stringify({body,attachmentIds,clientMessageId:crypto.randomUUID(),...(replyToMessageId?{replyToMessageId}:{})})});
export const toggleChatReaction=(conversationId:string,messageId:string,emoji:string)=>apiFetch<void>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,{...auth(),method:"POST",body:JSON.stringify({emoji})});
export const uploadChatAttachment=(conversationId:string,file:File)=>apiFetch<{data:ChatAttachment}>(`/chat/conversations/${encodeURIComponent(conversationId)}/attachments`,{...auth(),method:"POST",body:file,headers:{"Content-Type":"application/octet-stream","X-File-Name":encodeURIComponent(file.name),"X-File-Mime-Type":file.type||"application/octet-stream"}});
export async function downloadChatAttachment(id:string,name:string){const blob=await apiFetchBlob(`/chat/attachments/${encodeURIComponent(id)}`,auth());const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);}

export const updateChatGroup=(id:string,input:{title?:string;description?:string|null})=>apiFetch<{data:ChatConversation}>(`/chat/groups/${encodeURIComponent(id)}`,{...auth(),method:"PATCH",body:JSON.stringify(input)});
export const addChatGroupMember=(id:string,userId:string)=>apiFetch<void>(`/chat/groups/${encodeURIComponent(id)}/members`,{...auth(),method:"POST",body:JSON.stringify({userId})});
export const removeChatGroupMember=(id:string,userId:string)=>apiFetch<void>(`/chat/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,{...auth(),method:"DELETE"});
export const setChatGroupMemberRole=(id:string,userId:string,role:"ADMIN"|"MEMBER")=>apiFetch<void>(`/chat/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/role`,{...auth(),method:"PATCH",body:JSON.stringify({role})});
export const markChatRead=(id:string)=>apiFetch<void>(`/chat/conversations/${encodeURIComponent(id)}/read`,{...auth(),method:"POST",body:"{}"});
