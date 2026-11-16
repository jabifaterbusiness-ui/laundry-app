import { apiFetch, apiFetchBlob } from "./api-client.js";
import { useAuthStore } from "../state/auth-store.js";
const auth = () => ({ accessToken: useAuthStore.getState().accessToken });
export interface ChatPerson { id:string; fullName:string; email?:string; role?:string; branches?:Array<{id:string;name:string}>; }
export interface ChatAttachment { id:string; originalName:string; safeMimeType:string; sizeBytes:number; }
export interface ChatMessage { id:string; body:string; kind:"TEXT"|"SYSTEM"; createdAt:string; editedAt?:string|null; deletedAt?:string|null; sender:{id:string;fullName:string}; attachments?:ChatAttachment[]; reactions?:Array<{id:string;emoji:string;user:{id:string;fullName:string}}>; replyTo?:{id:string;body:string;sender:{fullName:string}}|null; }
export interface ChatConversation { id:string; kind:"DIRECT"|"GROUP"; title:string|null; description?:string|null; myRole?:string; unreadCount:number; lastMessage?:ChatMessage|null; lastMessageAt?:string|null; participants:Array<{id:string;user:ChatPerson;role:string;lastReadAt?:string|null}>; }
export const getChatConversations=()=>apiFetch<{data:ChatConversation[]}>("/chat/conversations",auth());
export const getChatDirectory=(search="")=>apiFetch<{data:ChatPerson[]}>(`/chat/directory?search=${encodeURIComponent(search)}`,auth());
export const getChatMessages=(id:string,search="")=>apiFetch<{data:ChatMessage[]}>(`/chat/conversations/${encodeURIComponent(id)}/messages${search.trim()?`?search=${encodeURIComponent(search.trim().slice(0,100))}`:""}`,auth());
export const startDirectChat=(id:string)=>apiFetch<{data:ChatConversation}>(`/chat/direct/${encodeURIComponent(id)}`,{...auth(),method:"POST",body:"{}"});
export const createChatGroup=(input:{title:string;description?:string;participantIds:string[];includeAllEligible:boolean;confirmLargeGroup:boolean})=>apiFetch<{data:ChatConversation}>("/chat/groups",{...auth(),method:"POST",body:JSON.stringify(input)});
export const sendChatMessage=(id:string,body:string,attachmentIds:string[]=[],replyToMessageId?:string,clientMessageId:string=crypto.randomUUID())=>apiFetch<{data:ChatMessage}>(`/chat/conversations/${encodeURIComponent(id)}/messages`,{...auth(),method:"POST",body:JSON.stringify({body,attachmentIds,clientMessageId,...(replyToMessageId?{replyToMessageId}:{})})});
export const editChatMessage=(conversationId:string,messageId:string,body:string)=>apiFetch<{data:ChatMessage}>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,{...auth(),method:"PATCH",body:JSON.stringify({body})});
export const deleteChatMessage=(conversationId:string,messageId:string)=>apiFetch<void>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,{...auth(),method:"DELETE"});
export const toggleChatReaction=(conversationId:string,messageId:string,emoji:string)=>apiFetch<void>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,{...auth(),method:"POST",body:JSON.stringify({emoji})});
export const uploadChatAttachment=(conversationId:string,file:File)=>apiFetch<{data:ChatAttachment}>(`/chat/conversations/${encodeURIComponent(conversationId)}/attachments`,{...auth(),method:"POST",body:file,headers:{"Content-Type":"application/octet-stream","X-File-Name":encodeURIComponent(file.name),"X-File-Mime-Type":file.type||"application/octet-stream"}});
export async function downloadChatAttachment(id:string,name:string){const blob=await apiFetchBlob(`/chat/attachments/${encodeURIComponent(id)}`,auth());const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}

export const updateChatGroup=(id:string,input:{title?:string;description?:string|null})=>apiFetch<{data:ChatConversation}>(`/chat/groups/${encodeURIComponent(id)}`,{...auth(),method:"PATCH",body:JSON.stringify(input)});
export const addChatGroupMember=(id:string,userId:string)=>apiFetch<void>(`/chat/groups/${encodeURIComponent(id)}/members`,{...auth(),method:"POST",body:JSON.stringify({userId})});
export const removeChatGroupMember=(id:string,userId:string)=>apiFetch<void>(`/chat/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,{...auth(),method:"DELETE"});
export const setChatGroupMemberRole=(id:string,userId:string,role:"ADMIN"|"MEMBER")=>apiFetch<void>(`/chat/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/role`,{...auth(),method:"PATCH",body:JSON.stringify({role})});
export const markChatRead=(id:string)=>apiFetch<void>(`/chat/conversations/${encodeURIComponent(id)}/read`,{...auth(),method:"POST",body:"{}"});

export interface ChatNotification {
 id:string; conversationId:string; conversationTitle:string|null; conversationKind:"DIRECT"|"GROUP";
 senderId:string; senderName:string; createdAt:string;
}
export const getChatNotifications=(since:string,afterId?:string)=>apiFetch<{data:ChatNotification[]}>(`/chat/notifications?since=${encodeURIComponent(since)}${afterId?`&afterId=${encodeURIComponent(afterId)}`:""}`,auth());
