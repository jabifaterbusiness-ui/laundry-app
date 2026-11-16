import { apiFetch, apiFetchBlob } from "./api-client.js";
import { useAuthStore } from "../state/auth-store.js";
const auth = () => ({ accessToken: useAuthStore.getState().accessToken });
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
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

export interface ChatRealtimeEvent {
 type:"message.created"|"message.updated"|"message.deleted"|"message.reaction"|"conversation.read"|"conversation.delivered"|"conversation.updated"|"conversation.removed"; id:string; conversationId:string; messageId?:string; actorUserId?:string; createdAt:string;
}
export function consumeChatEventFrames(input:string):{remaining:string;events:ChatRealtimeEvent[]}{
 let buffer=input.replace(/\r\n/g,"\n");
 const events:ChatRealtimeEvent[]=[];
 let boundary=buffer.indexOf("\n\n");
 while(boundary>=0){
  const frame=buffer.slice(0,boundary);
  buffer=buffer.slice(boundary+2);
  const data=frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
  if(data){try{events.push(JSON.parse(data) as ChatRealtimeEvent);}catch{/* Ignore malformed or unsupported event frames. */}}
  boundary=buffer.indexOf("\n\n");
 }
 return {remaining:buffer,events};
}
export async function connectChatEventStream(onEvent:(event:ChatRealtimeEvent)=>void,signal:AbortSignal):Promise<void>{
 const {accessToken}=useAuthStore.getState();
 const branchId=useAuthStore.getState().activeBranchId;
 if(!accessToken||!branchId)throw new Error("Chat authentication and an active branch are required");
 const response=await fetch(`${API_BASE_URL}/chat/events`,{headers:{Authorization:`Bearer ${accessToken}`,"X-Branch-Id":branchId,Accept:"text/event-stream"},signal});
 if(!response.ok){const error=new Error(`Chat event stream failed with status ${response.status}`) as Error&{status:number};error.status=response.status;throw error;}
 if(!response.body)throw new Error("Chat event stream is unavailable in this browser");
 const reader=response.body.getReader();
 const decoder=new TextDecoder();
 let buffer="";
 try{
  while(!signal.aborted){
   const {done,value}=await reader.read();
   if(done)return;
   buffer+=decoder.decode(value,{stream:true});
   const parsed=consumeChatEventFrames(buffer);
   buffer=parsed.remaining;
   for(const event of parsed.events)onEvent(event);
  }
 }finally{
  reader.releaseLock();
 }
}
